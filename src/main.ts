import {
	CompanionActionInfo,
	CompanionFeedbackInfo,
	CompanionVariableDefinition,
	CompanionVariableValues,
	InstanceBase,
	InstanceStatus,
	LogLevel,
	TCPHelper,
	runEntrypoint,
} from '@companion-module/base'
import getActionDefinitions from './actions'
import { SoundwebConfig, getConfigFields } from './config'
import UpgradeScripts from './upgrades'
// const bssLib = require('./bss_lib');
import { setTimeout as asynSetTimeout } from 'timers/promises'
import { ZodError, z } from 'zod'
import { DependentType } from './dependents'
import getFeedbackDefinitions from './feedbacks'
import { ParameterSetType } from './options'
import {
	ParameterSubscriptionManager,
	ParameterSubscriptionType,
	ParameterUnit,
	ParameterValueChangeNotification,
} from './parameters'
import * as sweb from './sweb'
import { VariableManager } from './variableManager'
import { ModuleConnectionStatus, NodeConnectionWatchdog, NodeOnlineStatus } from './watchdog'

const WATCHDOG_TIME_PARAMETER = '0.0.0.0.2' // Time

/**
 * Helper function to produce a log entry for a Soundweb control message
 * @param topic Placed into the log message to indicate the context of the message
 * @param message An object containing the message details
 * @returns A log message entry
 */
function buildSwebMsgLogEntry(
	topic: string,
	message: { msg_type: number; address: sweb.ParameterAddress; data?: number | string }
) {
	// Log the parsed command
	let logMsg = `[${topic}] Msg Type: ${sweb.MessageType[message.msg_type]}, Parameter: ${message.address.toString()}`
	if (!(message.data == undefined)) {
		logMsg = `${logMsg}, Data: ${message.data}`
	}
	return logMsg
}

/**
 * Helper function to convert a parameter value to its raw equivalent
 * @param value A parameter value with the given unit
 * @param unit The unit for the given value
 * @returns The equivalent raw value for the parameter
 */
function convertUnitToRaw(value: number, unit: ParameterUnit) {
	switch (unit) {
		case ParameterUnit.DB:
			return sweb.dbToRaw(value)
		case ParameterUnit.PERCENT:
			return sweb.percentToRaw(value)
		case ParameterUnit.BOOL:
		case ParameterUnit.RAW:
			return value
		default:
			throw Error(`Parameter unit: ${ParameterUnit[unit]} is not supported yet.`)
	}
}

/**
 * Helper function to convert a raw parameter value to one with the given unit
 * @param value A raw parameter value
 * @param unit The target unit for the parameter value
 * @returns The equivalent value for the parameter in the given unit
 */
function convertRawToUnit(value: number, unit: ParameterUnit) {
	switch (unit) {
		case ParameterUnit.DB:
			return sweb.rawToDb(value)
		case ParameterUnit.PERCENT:
			return sweb.rawToPercent(value)
		case ParameterUnit.BOOL:
		case ParameterUnit.RAW:
			return value
		default:
			throw Error(`Parameter unit: ${ParameterUnit[unit]} is not supported yet.`)
	}
}

/**
 * A function for probing a node to check it has a healthy connection.  This should trigger a single response.
 * @param sendToDevice Callback function to send a buffer to the device
 */
async function watchdogDeviceProbe(sendToDevice: (buf: Buffer) => void, node: number | string): Promise<void> {
	// Subscribe to the time parameter on the device to probe a response out of it
	sendToDevice(sweb.buildSubscribeBuf(sweb.ParameterAddress.fromString(`${node}.${WATCHDOG_TIME_PARAMETER}`)))
	// Wait a short period of time before unsubscribing again
	// TODO introduce logic in the watchdog to identify if this next unsubscribe hasn't happened.
	await asynSetTimeout(300)
	sendToDevice(sweb.buildUnsubscribeBuf(sweb.ParameterAddress.fromString(`${node}.${WATCHDOG_TIME_PARAMETER}`)))
}

/**
 * An instance of the Soundweb Companion Module
 * @param parameterSubscriptionManager A manager responsible for maintaining subscriptions to device parameters
 * @param variableManager A manager for maintaining module variables
 * @param config The module configuration
 * @param socket TCP socket helper object for handling comms with the Soundweb device
 * @param connectionWatchdog A Node Connection Watchdog that monitors the comms health of nodes
 */
export class SoundwebModuleInstance extends InstanceBase<SoundwebConfig> {
	config: SoundwebConfig | undefined
	socket: TCPHelper | undefined
	parameterSubscriptionManager: ParameterSubscriptionManager | undefined
	variableManager: VariableManager | undefined
	connectionWatchdog: NodeConnectionWatchdog | undefined

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: SoundwebConfig) {
		// Validate and update the module's configuration with the supplied configuration
		let configUpdated = this.#updateConfig(config)
		// If the configuration update was successful, continue with module initialisation
		if (!(configUpdated && this.config)) {
			this.log(
				'error',
				'The module could not be initialised because the configuration is not valid.  Please check your configuration.'
			)
			return
		}

		this.#initModule()
	}

	/**
	 * Private module initialiser.
	 */
	#initModule() {
		this.log('info', 'Initialising module...')

		if (this.config == undefined) return

		// Create a Parameter Subscription Manager
		this.parameterSubscriptionManager = new ParameterSubscriptionManager(
			(paramAddress, subType) => this.deviceSubscribeParameter(paramAddress, subType),
			(paramAddress, subType) => this.deviceUnsubscribeParameter(paramAddress, subType),
			(notification) => this.#onParameterValueChanged(notification)
		)

		// Create a Variable Manager
		this.variableManager = new VariableManager(
			(defs) => this.#onVariableDefinitionsUpdated(defs),
			(vals) => this.#onVariableValuesUpdated(vals)
		)

		// Update module status
		this.updateStatus(InstanceStatus.Disconnected)

		// Create connection watchdog to alert module to nodes coming online etc
		this.connectionWatchdog = new NodeConnectionWatchdog(
			(node: number) => watchdogDeviceProbe((buf: Buffer) => this.deviceSendBuffer(buf), node),
			{
				pollPeriod: 5000,
				onlineThreshold: 2,
				offlineThreshold: 2,
			}
		)

		// Connection Watchdog Handlers
		// Handle when we lose all nodes or connect to our first node
		this.connectionWatchdog.events.on('connectionStatus', (connectionStatus) => {
			switch (connectionStatus) {
				case ModuleConnectionStatus.CONNECTED:
					// this.log('info', `Device control has been established via the node @ ${this.config!.host}`)
					this.updateStatus(InstanceStatus.Ok)
					break

				case ModuleConnectionStatus.DISCONNECTED:
					this.log(
						'error',
						`Companion has lost communication with all nodes referenced in actions & feedbacks.  Double check node addresses and Companion's connection with the node @ ${
							this.config!.host
						}`
					)
					// this.connectionWatchdog?.stop()
					this.updateStatus(InstanceStatus.ConnectionFailure)
				// this.connectionWatchdog?.stop()
				// this.#initComms()
			}
		})

		// Handle a node coming online and going offline
		this.connectionWatchdog.events.on('nodeOnlineStatus', ({ node, onlineStatus }) => {
			if (onlineStatus == NodeOnlineStatus.ONLINE) {
				this.log('info', `Node ${node} has come online.  Resynchronising device parameters...`)
				this.parameterSubscriptionManager?.subscribeNodeParameters(node)
			} else {
				this.log('error', `Node ${node} has gone offline.`)
			}
		})

		// Handle the watchdog starting
		this.connectionWatchdog.events.on('watchdogStarted', () => {
			this.log('debug', 'Node connection watchdog has started...')
		})

		// Handle the watchdog stopping
		this.connectionWatchdog.events.on('watchdogStopped', () => {
			this.log('debug', 'Node connection watchdog has stopped.')
		})

		// Handle a heartbeat when a device is coming online
		this.connectionWatchdog.events.on('nodeHeartbeatResponse', ({ node, count }) => {
			if (!this.connectionWatchdog?.nodeOnline(node) && count == 1) {
				this.log('debug', `Node ${node} has started communicating with Companion.  Checking connection...`)
			}
		})

		// Handle a node missing a heartbeat
		this.connectionWatchdog.events.on('nodeHeartbeatMissed', ({ node, count }) => {
			if (!this.connectionWatchdog?.nodeOnline(node)) return
			this.log('warn', `Node ${node} has missed ${count} heartbeat response${count > 1 ? 's in a row' : ''}.`)
		})

		// Prepare actions and feedbacks
		this.#clearAndSubscribeAll()

		// Attempt to connect to our gateway node
		this.#initComms()

		this.log(
			'info',
			`Soundweb module [${this.label}] has been initialised.  Attempting to establish a TCP connection with ${this.config.host}...`
		)
	}

	/**
	 * Called by module to get configuration fields
	 */
	getConfigFields() {
		return getConfigFields()
	}

	/**
	 * Called when the configuration has been updated
	 */
	async configUpdated(config: SoundwebConfig) {
		// We'll treat this the same as an init to be safe, since a full init is not too expensive.
		await this.destroy()
		this.init(config)
	}

	/**
	 * Parses, validates and sets the configuration from user input
	 */
	#updateConfig(config: SoundwebConfig): boolean {
		// Parse the configuration
		try {
			let parsedConfig: SoundwebConfig = {
				host: z.coerce.string().ip().parse(config.host),
			}
			this.config = parsedConfig
			this.log('info', 'The module configuration is valid and has been set.')
			return true
		} catch (error) {
			this.updateStatus(InstanceStatus.BadConfig)
			if (error instanceof ZodError) {
				this.log('error', `The module configuration is invalid: ${error.message}`)
			} else {
				this.log('error', 'There was an unknown error with the module configuration')
			}
			return false
		}
	}

	/**
	 * Called by the module to clean up the instance before it is destroyed
	 */
	async destroy() {
		this.log('warn', `Destroying module instance: ${this.label} (${this.config?.host})`)

		// Stop and clean out the connectionWatchdog
		await this.connectionWatchdog?.destroy()

		// Try to unsubscribe from all parameters (on the device) and close the socket
		if (this.socket) {
			this.parameterSubscriptionManager?.unsubscribeAll()
			this.socket.destroy()
		} else {
			this.updateStatus(InstanceStatus.Disconnected)
		}
		this.log('debug', `The module has been destroyed and cleaned up.`)
	}

	/**
	 * Writes a line to the log with a timestamp
	 */
	log(level: LogLevel, message: string, time?: number) {
		let timestamp = time ? new Date(time).toISOString().slice(0, -1) : new Date().toISOString().slice(0, -1)
		timestamp = timestamp.replace('T', ' ')
		super.log(level, `${timestamp} ${message}`)
	}

	/**
	 * Logs a transmitted message
	 */
	logTX(msgType: sweb.MessageType, paramAddress: sweb.ParameterAddress, data?: number | string | undefined) {
		this.log(
			'debug',
			buildSwebMsgLogEntry('MODULE TX', {
				msg_type: msgType,
				address: paramAddress,
				data: data,
			})
		)
	}

	/**
	 * Logs a received message
	 */
	logRX(msgType: sweb.MessageType, paramAddress: sweb.ParameterAddress, data?: number | string | undefined) {
		this.log(
			'debug',
			buildSwebMsgLogEntry('MODULE RX', {
				msg_type: msgType,
				address: paramAddress,
				data: data,
			})
		)
	}

	/**
	 * Callback/handler for when module variable values should be updated.  Called by Variable Manager.
	 */
	#onVariableValuesUpdated(values: CompanionVariableValues): void {
		this.log(
			'debug',
			`Setting module variable values: ${Object.entries(values)
				.map(([varId, value]) => `\n\t${varId}: ${value}`)
				.join('')}`
		)

		this.setVariableValues(values)
	}

	/**
	 * Callback/handler for when module variable definitions should be updated.  Called by Variable Manager.
	 */
	#onVariableDefinitionsUpdated(variableDefs: CompanionVariableDefinition[]) {
		this.log(
			'debug',
			`Setting ${variableDefs.length} module variable definitions: ${variableDefs
				.map((varDef) => `\n\t${varDef.variableId}`)
				.join('')}`
		)
		this.setVariableDefinitions(variableDefs)
	}

	/**
	 * Callback/handler for when a parameter value has changed
	 */
	#onParameterValueChanged(notification: ParameterValueChangeNotification) {
		// Instruct registered feedbacks to check the current value
		let feedbackIds = notification.dependents[DependentType.FEEDBACK] ?? []
		this.checkFeedbacksById(...feedbackIds)

		// Update module variable values
		let variableIds = notification.dependents[DependentType.VARIABLE] ?? []
		this.variableManager?.updateModuleVariableValues(variableIds, notification.value)
	}

	// TODO Move all these device methods into some sort of comms object??

	/**
	 * Send a buffer to the gateway node
	 */
	deviceSendBuffer(buf: Buffer): void {
		if (this.socket == undefined || this.socket.isDestroyed) return
		this.socket.send(buf).catch((err) => this.log('error', `Error sending message: ${err}`)) // <- This is async
	}

	/**
	 * Send a subscribe message
	 */
	async deviceSubscribeParameter(paramAddress: sweb.ParameterAddress, subscriptionType: ParameterSubscriptionType) {
		if (!this.connectionWatchdog?.nodeOnline(paramAddress.node)) return
		switch (subscriptionType) {
			case ParameterSubscriptionType.RAW:
				this.logTX(sweb.MessageType.SUBSCRIBE, paramAddress)
				this.deviceSendBuffer(sweb.buildSubscribeBuf(paramAddress))
				break
			case ParameterSubscriptionType.PERCENT:
				this.logTX(sweb.MessageType.SUBSCRIBE_PERCENT, paramAddress)
				this.deviceSendBuffer(sweb.buildSubscribePercentBuf(paramAddress))
				break
		}
	}

	/**
	 * Send an unsubscribe message
	 */
	async deviceUnsubscribeParameter(paramAddress: sweb.ParameterAddress, subscriptionType: ParameterSubscriptionType) {
		if (!this.connectionWatchdog?.nodeOnline(paramAddress.node)) return
		switch (subscriptionType) {
			case ParameterSubscriptionType.RAW:
				this.logTX(sweb.MessageType.UNSUBSCRIBE, paramAddress)
				this.deviceSendBuffer(sweb.buildUnsubscribeBuf(paramAddress))
				break
			case ParameterSubscriptionType.PERCENT:
				this.logTX(sweb.MessageType.UNSUBSCRIBE_PERCENT, paramAddress)
				this.deviceSendBuffer(sweb.buildUnsubscribePercentBuf(paramAddress))
				break
		}
	}

	/**
	 * Send a message to set a relative value for a given paraemeter
	 */
	async deviceSetRelative(paramAddress: sweb.ParameterAddress, value: number, unit: ParameterUnit): Promise<void> {
		if (!this.connectionWatchdog?.nodeOnline(paramAddress.node)) return
		if (this.parameterSubscriptionManager == undefined) return // Shouldn't arise, but handle anyway

		// To perform a relative change, first we need to get the parameter value, then we can mutate it accordingly
		switch (unit) {
			case ParameterUnit.PERCENT: {
				// NB: We tried using 'BUMP_PERCENT', but rounding errors appeared to build up after repetative actions.
				let { error, data: currentValue } = await this.parameterSubscriptionManager.getParameterValue(
					paramAddress,
					ParameterSubscriptionType.PERCENT
				)
				if (error) return this.log('error', error.message) // If we don't have a value, we can't continue
				if (currentValue == null || typeof currentValue == 'string') return // We can't handle a NULL or string value

				// We must convert the stored 'currentValue' to its scaled unit first to account for ranged scaling laws
				currentValue = convertRawToUnit(currentValue, unit)
				value = convertUnitToRaw((value += currentValue), unit)

				this.logTX(sweb.MessageType.BUMP_PERCENT, paramAddress, value)
				this.deviceSendBuffer(sweb.buildSetParameterBuf(paramAddress, value, sweb.MessageType.SET_PERCENT))

				break
			}
			default: {
				let { error, data: currentValue } = await this.parameterSubscriptionManager.getParameterValue(
					paramAddress,
					ParameterSubscriptionType.RAW
				)
				if (error) return this.log('error', error.message) // If we don't have a value, we can't continue
				if (currentValue == null || typeof currentValue == 'string') return // We can't handle a NULL or string value

				// We must convert the stored 'currentValue' to its scaled unit first to account for ranged scaling laws
				currentValue = convertRawToUnit(currentValue, unit)
				value = convertUnitToRaw((value += currentValue), unit)

				this.logTX(sweb.MessageType.SET, paramAddress, value)
				this.deviceSendBuffer(sweb.buildSetParameterBuf(paramAddress, value, sweb.MessageType.SET))
				break
			}
		}
	}

	/**
	 * Send a message to set an absolute value for a given parameter
	 */
	deviceSetAbsolute(paramAddress: sweb.ParameterAddress, value: number, unit: ParameterUnit): void {
		if (!this.connectionWatchdog?.nodeOnline(paramAddress.node)) return

		value = convertUnitToRaw(value, unit)
		switch (unit) {
			case ParameterUnit.PERCENT:
				this.logTX(sweb.MessageType.SET_PERCENT, paramAddress, value)
				this.deviceSendBuffer(sweb.buildSetParameterBuf(paramAddress, value, sweb.MessageType.SET_PERCENT))
				break
			default:
				this.logTX(sweb.MessageType.SET, paramAddress, value)
				this.deviceSendBuffer(sweb.buildSetParameterBuf(paramAddress, value, sweb.MessageType.SET))
		}
	}

	/**
	 * Send a message to toggle a value for a given parameter
	 */
	async deviceSetToggle(
		paramAddress: sweb.ParameterAddress,
		unit: ParameterUnit,
		toggleValues: Array<number | string> = []
	) {
		if (!this.connectionWatchdog?.nodeOnline(paramAddress.node)) return
		if (this.parameterSubscriptionManager == undefined) return // Shouldn't arise, but handle anyway
		// Get current (unit) value of
		let currentValue = await this.getParameterValue(paramAddress, unit)
		if (currentValue == null) return // We can't handle a NULL value

		let newValue
		if (toggleValues.length > 1) {
			let idx = toggleValues.indexOf(currentValue)
			if (idx + 1 == toggleValues.length) {
				newValue = toggleValues[0]
			} else {
				newValue = toggleValues[idx + 1]
			}
		} else {
			newValue = +!currentValue // Get inverse value of current value
		}
		if (typeof newValue != 'number') return // We can't handle anything other than numbers atm
		// newValue = convertUnitToRaw(newValue, unit)
		this.deviceSetAbsolute(paramAddress, newValue, unit)

		// After setting the value, we need to get the new value sent back to us.
		this.updateParameterValueFromDevice(paramAddress)
	}

	/**
	 * Send a message to set a parameter value
	 */
	async deviceSetParameterValue(
		paramAddress: sweb.ParameterAddress,
		setType: ParameterSetType,
		value: number,
		unit: ParameterUnit = ParameterUnit.RAW
	): Promise<void> {
		if (!this.connectionWatchdog?.nodeOnline(paramAddress.node)) return

		// Switch based on whether it is a relative, absolute or toggle adjustment
		switch (setType) {
			case ParameterSetType.ABSOLUTE:
				this.deviceSetAbsolute(paramAddress, value, unit)
				break
			case ParameterSetType.RELATIVE:
				await this.deviceSetRelative(paramAddress, value, unit)
				break
		}

		// After setting the value, we need to get the new value sent back to us.
		this.updateParameterValueFromDevice(paramAddress)
	}

	/**
	 * Returns the value of a given parameter
	 */
	async getParameterValue(
		paramAddress: sweb.ParameterAddress,
		unit: ParameterUnit = ParameterUnit.RAW,
		returnRaw: boolean = false
	): Promise<number | string | null> {
		if (this.connectionWatchdog?.nodeOffline(paramAddress.node)) return null

		let subType = unit == ParameterUnit.PERCENT ? ParameterSubscriptionType.PERCENT : ParameterSubscriptionType.RAW
		if (this.parameterSubscriptionManager == null) return null

		let { data: value, error } = await this.parameterSubscriptionManager.getParameterValue(paramAddress, subType)

		if (error) {
			this.log('error', error.message)
			return null
		}

		if (value == null) return value // If it's null, just return

		// Convert to the supplied unit if returnRaw == false, else just return the raw value
		if (returnRaw) return value
		if (typeof value == 'number') {
			return convertRawToUnit(value, unit)
		}
		return value
	}

	/**
	 * Called when a message has been received with a parameter value
	 */
	updateParameterValueFromDevice(paramAddress: sweb.ParameterAddress): void {
		if (this.parameterSubscriptionManager == undefined) throw Error('Subscription manager has not been initialised')
		this.parameterSubscriptionManager.updateCachedParameterValueFromDevice(paramAddress)
	}

	/**
	 * Create a variable definition and register the dependent asking for it to be created
	 */
	async #createVariableDefinitionAndRegisterDependent(
		paramAddress: sweb.ParameterAddress,
		unit: ParameterUnit,
		dependentType: DependentType,
		dependentId: string
	) {
		let varDef = this.variableManager?.getVariableDefinition(paramAddress, unit)
		let isNewVarDef = varDef == undefined ? true : false

		varDef = varDef ?? this.variableManager?.createVariableDefinition(paramAddress, unit)

		if (varDef != undefined) {
			// Register the supplied depdendent on the variable definition
			this.variableManager?.registerDependent(dependentType, dependentId, varDef.id)

			// Register the variable definition with the parameter subscription manager so it can be made aware of parameter value changes
			this.parameterSubscriptionManager?.registerDependent(DependentType.VARIABLE, varDef.id, paramAddress, unit)

			if (isNewVarDef) {
				// We now need to initialise the variable value.  TODO Factor out?
				let initValue = await this.getParameterValue(paramAddress, unit, true) // Get the current raw value
				this.variableManager?.updateModuleVariableValues([varDef.id], initValue)
				this.log('debug', `Created new module variable definition: ${varDef.id}`)
			}
		}
	}

	/**
	 * Deregister a dependent (feedback/action etc) from a variable etc.
	 */
	deregisterVariableDependent(dependentType: DependentType, dependentId: string) {
		if (!this.variableManager) return
		let { purgedDefinitions } = this.variableManager?.deregisterDependent(dependentType, dependentId)
		purgedDefinitions.forEach((defId) => {
			this.log('debug', `Removed module variable definition: ${defId}`)
			this.parameterSubscriptionManager?.deregisterDependent(DependentType.VARIABLE, defId)
		})
	}

	/**
	 * Let the module know when an action has been created/edited
	 */
	async subscribeAction(action: CompanionActionInfo, paramAddress: sweb.ParameterAddress, unit: ParameterUnit) {
		this.log('debug', `Subscribing action: '${action.actionId} @ ${action.controlId}' (${action.id})`)
		if (this.parameterSubscriptionManager == undefined)
			throw Error('Cannot subscribe to action because the module is not fully initialised')

		this.parameterSubscriptionManager?.registerDependent(DependentType.ACTION, action.id, paramAddress, unit)
		this.connectionWatchdog?.addNodeDependency(paramAddress.node, action.id)
	}

	/**
	 * Let the module know that an action has been deleted on the settings have changed
	 */
	async unsubscribeAction(action: CompanionActionInfo) {
		this.log('debug', `Unsubscribing action: '${action.actionId}' @ ${action.controlId} (${action.id})`)

		this.parameterSubscriptionManager?.deregisterDependent(DependentType.ACTION, action.id)

		this.deregisterVariableDependent(DependentType.ACTION, action.id)
		this.connectionWatchdog?.removeNodeDependency(action.id)
	}

	/**
	 * Let the module know when a feedback has been create
	 */
	async subscribeFeedback(
		feedback: CompanionFeedbackInfo,
		paramAddress: sweb.ParameterAddress,
		unit: ParameterUnit,
		createVariable: boolean = false
	) {
		this.log('debug', `Subscribing feedback: '${feedback.feedbackId}' @ ${feedback.controlId} (${feedback.id})`)
		if (this.variableManager == undefined || this.parameterSubscriptionManager == undefined)
			throw Error('Cannot subscribe to feedback because the module is not fully initialised')

		// Register this feedback as a dependent of a (possibly new) parameter subscription
		// This method will create a parameter subscription if it doesn't already exist
		this.parameterSubscriptionManager.registerDependent(DependentType.FEEDBACK, feedback.id, paramAddress, unit)

		// If we have been asked to create a variable, do it and make all the necessary connections
		if (createVariable) {
			this.#createVariableDefinitionAndRegisterDependent(paramAddress, unit, DependentType.FEEDBACK, feedback.id)
		}
		this.connectionWatchdog?.addNodeDependency(paramAddress.node, feedback.id)
	}

	/**
	 * Let the module know when an feedback has been deleted or edited
	 */
	async unsubscribeFeedback(feedback: CompanionFeedbackInfo) {
		this.log('debug', `Unsubscribing feedback: '${feedback.feedbackId}' @ ${feedback.controlId} (${feedback.id})`)

		this.parameterSubscriptionManager?.deregisterDependent(DependentType.FEEDBACK, feedback.id)

		this.deregisterVariableDependent(DependentType.FEEDBACK, feedback.id)

		this.connectionWatchdog?.removeNodeDependency(feedback.id)
	}

	/**
	 * Clear/reset all
	 */
	#clearAndSubscribeAll() {
		// Clear any parameter subscriptions and variable definitions
		this.parameterSubscriptionManager?.unsubscribeAll()
		this.variableManager?.clearDefinitions()
		this.connectionWatchdog?.clearDependencies()

		this.setActionDefinitions(getActionDefinitions(this))
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))

		this.subscribeFeedbacks()
		this.subscribeActions()
	}

	/**
	 * Initialise a TCP connection with the gateway Node
	 */
	#initComms() {
		if (this.socket) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.config == undefined) throw Error('Module configuration is undefined, so comms cannot be initialised')

		let ipAddress = this.config.host
		this.socket = new TCPHelper(ipAddress, sweb.DI_PORT, { reconnect_interval: 20000 })

		// this.socket.on('status_change', (status, message) => {
		// 	this.updateStatus(status, message)
		// })

		this.socket.on('error', (err) => {
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
			this.log('error', 'There was an error connecting to the Soundweb device: ' + err.message)
			this.connectionWatchdog?.stop()
		})

		this.socket.on('end', () => {
			this.updateStatus(InstanceStatus.Disconnected)
			this.connectionWatchdog?.stop()
		})

		this.socket.on('connect', () => {
			this.log(
				'info',
				`A TCP connection has been established with the Soundweb device at ${ipAddress}.  Attempting to use control protocol...`
			)
			this.updateStatus(InstanceStatus.Ok)
			// this.#clearAndSubscribeAll()
			this.connectionWatchdog?.start()
		})

		// Handle data received
		this.socket.on('data', (data) => {
			// Create a log message to show received data
			// TODO make optional in module config?
			// this.log(
			// 	'debug',
			// 	`Data received:\n${data
			// 		.toString('hex')
			// 		.match(/.{1,2}/g)
			// 		?.join()
			// 		.match(/02.*?03/g)
			// 		?.join('\n')}`
			// )
			try {
				this.#handleRecvData(data)
			} catch (err) {
				this.log(
					'error',
					`Error handling received data:\n${data
						.toString('hex')
						.match(/.{1,2}/g)
						?.join()
						.match(/02.*?03/g)
						?.join('\n')}`
				)
			}
		})
	}

	/**
	 * Parse the received data and return a list of messages.
	 */
	#parseReceivedData(data: Buffer): { msg_type: sweb.MessageType; address: sweb.ParameterAddress; data: Buffer }[] {
		let recvBuffer: Array<number> = [] // A receive buffer (not a 'Buffer' type) to temporarily store our recevied data
		let returnedMessages = []
		// Iterate over the bytes in the received data
		for (let i = 0; i < data.length; i++) {
			recvBuffer.push(data[i]) // Append byte to the end of our receive buffer

			// Check to see if the byte was an 'ETX' end of transmission.  If so, handle the message.
			if (data[i] == 0x03) {
				// Slice out message from STX (0x02)
				let stxIdx = recvBuffer.indexOf(0x02)

				if (stxIdx != -1) {
					// If 0x02 is in the buffer
					let encapsulatedCmd = Buffer.from(recvBuffer.slice(stxIdx, recvBuffer.length))

					let decapsulatedCmd = sweb.decapsulateCommand(encapsulatedCmd)

					if (decapsulatedCmd == null) continue // Clearly can't be handled so just continue to next one

					returnedMessages.push({
						msg_type: sweb.getMessageTypeBuffer(decapsulatedCmd)[0],
						address: sweb.ParameterAddress.fromBuf(sweb.getAddressBuffer(decapsulatedCmd)),
						data: sweb.getDataBuffer(decapsulatedCmd),
					})
				}
				recvBuffer = [] // Clear the buffer so it's ready for the next message
			}
		}
		return returnedMessages
	}

	/**
	 * Handler for received data
	 */
	#handleRecvData(data: Buffer) {
		// TODO Move all this into some kind of parser object?
		this.#parseReceivedData(data).forEach((parsedMsg) => {
			switch (parsedMsg.msg_type) {
				// TODO Message handler factory?
				case sweb.MessageType.SET: {
					let subscriptionType = ParameterSubscriptionType.RAW
					let value = sweb.decDiscrete(parsedMsg.data)
					let node = parsedMsg.address.node
					let hearbeatMsg = sweb.ParameterAddress.fromString(`${node}.${WATCHDOG_TIME_PARAMETER}`).toString()

					// Check to see if message is a heartbeat response.  If it is, send it to the connection watchdog to handle
					if (parsedMsg.address.toString() == hearbeatMsg) {
						this.connectionWatchdog?.handleHeartbeatResponse(node, value)
					} else {
						this.logRX(parsedMsg.msg_type, parsedMsg.address, value)
						this.parameterSubscriptionManager?.setCachedParameterValue(parsedMsg.address, subscriptionType, value)
					}
					break
				}

				case sweb.MessageType.SET_PERCENT: {
					let subscriptionType = ParameterSubscriptionType.PERCENT
					let value = sweb.decDiscrete(parsedMsg.data)
					this.logRX(parsedMsg.msg_type, parsedMsg.address, value)
					this.parameterSubscriptionManager?.setCachedParameterValue(parsedMsg.address, subscriptionType, value)
					break
				}
			}
		})
	}
}

runEntrypoint(SoundwebModuleInstance, UpgradeScripts) // Time parameter: 0x100100000000.2
