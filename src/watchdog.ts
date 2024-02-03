import { EventEmitter, once } from 'events'
import { setTimeout as asynSetTimeout } from 'timers/promises'
import { createBasicEventEmitter } from './basicEventEmitter'
import { ResponseNotifier } from './responseNotifier'

export enum ModuleConnectionStatus {
	CONNECTED = 'CONNECTED',
	DISCONNECTED = 'DISCONNECTED',
}

export enum NodeOnlineStatus {
	ONLINE = 'ONLINE',
	OFFLINE = 'OFFLINE',
}

type ConnectionWatchdogEvents = {
	connectionStatus: ModuleConnectionStatus
	watchdogStopped: null
	watchdogStarted: null

	nodeOnlineStatus: { node: number; onlineStatus: NodeOnlineStatus }
	nodeReportUpdate: NodeReport
	nodeHeartbeatMissed: { node: number; count: number }
	nodeHeartbeatResponse: { node: number; count: number }
}

type PollerEvents = {
	onlineStatus: NodeOnlineStatus

	heartbeatStarted: null
	heartbeatStopped: null
	heartbeatResponse: { time: number; data: number | null; count: number; threshold: number }
	heartbeatMissed: { time: number; count: number; threshold: number }
}

type NodeReport = {
	online: Map<number, { node: number; onlineSince: number }>
	offline: Map<number, { node: number; lastSeen: number }>
}

export class DependencyManager<DependencyIdType, DependentIdType> {
	#dependentsToDependencies: Map<DependentIdType, Set<DependencyIdType>> = new Map()
	#dependenciesToDependents: Map<DependencyIdType, Set<DependentIdType>> = new Map()

	addDependent(dependentId: DependentIdType, dependencyId: DependencyIdType) {
		let dependents = this.#dependenciesToDependents.get(dependencyId) ?? new Set()
		dependents.add(dependentId)
		this.#dependenciesToDependents.set(dependencyId, dependents)

		let dependencies = this.#dependentsToDependencies.get(dependentId) ?? new Set()
		dependencies.add(dependencyId)
		this.#dependentsToDependencies.set(dependentId, dependencies)
	}

	removeDependent(dependentId: DependentIdType, dependencyId: DependencyIdType) {
		this.#dependenciesToDependents.get(dependencyId)?.delete(dependentId)
		this.#dependentsToDependencies.get(dependentId)?.delete(dependencyId)

		if (this.#dependenciesToDependents.get(dependencyId)?.size == 0) this.#dependenciesToDependents.delete(dependencyId)
		if (this.#dependentsToDependencies.get(dependentId)?.size == 0) this.#dependentsToDependencies.delete(dependentId)
	}

	getDependents(dependencyId: DependencyIdType) {
		return this.#dependenciesToDependents.get(dependencyId)
	}

	getDependencies(dependentId: DependentIdType) {
		return this.#dependentsToDependencies.get(dependentId)
	}

	hasDependents(dependencyId: DependencyIdType) {
		let dependents = this.#dependenciesToDependents.get(dependencyId) ?? new Set()
		return dependents.size > 0
	}

	hasNoDependents(dependencyId: DependencyIdType) {
		return !this.hasDependents(dependencyId)
	}

	clearMap() {
		this.#dependenciesToDependents = new Map()
		this.#dependentsToDependencies = new Map()
	}
}

/**
 * A watchdog that monitors the connection and application layer communication health of Soundweb nodes
 * @param events An event emitter that notifies listeners of various events
 * @param options A manager for handling module variables
 * @param nodePollerMap A map of node addresses to pollers that carry out the probing of the devices
 * @param dependencyManager A manager that maintains a list of node depndencies.
 */
export class NodeConnectionWatchdog {
	events = createBasicEventEmitter<ConnectionWatchdogEvents>()
	options: { pollPeriod: number; offlineThreshold: number; onlineThreshold: number }
	nodePollerMap: Map<number, NodePoller> = new Map()
	dependencyManager: DependencyManager<number, string> = new DependencyManager()

	#heartBeatCb: (node: number) => Promise<void>

	#connnected: boolean = false
	#running: boolean = false

	/**
	 * @param options Options for configuring the behaviour of the watchdog
	 * @param heartBeatFn A callback to probe the node for a response
	 */
	constructor(
		heartBeatFn: (node: number) => Promise<void>,
		options?: { pollPeriod?: number; offlineThreshold?: number; onlineThreshold?: number }
	) {
		this.#heartBeatCb = heartBeatFn
		this.options = {
			pollPeriod: 5000,
			offlineThreshold: 2,
			onlineThreshold: 2,
		}
		if (options) this.options = { ...this.options, ...options }
	}

	get isRunning() {
		return this.#running
	}

	get isOnline() {
		return this.#connnected
	}

	nodeOnline(nodeAddress: number): boolean {
		return this.nodePollerMap.get(nodeAddress)?.isOnline ?? false
	}

	nodeOffline(nodeAddress: number): boolean {
		return !this.nodeOnline(nodeAddress)
	}

	start() {
		if (!this.isRunning) {
			this.events.emit('watchdogStarted')
			this.#running = true
			this.nodePollerMap.forEach((poller) => poller.start())
		}
	}

	async stop() {
		if (this.isRunning) {
			let pollers = [...this.nodePollerMap.values()]
			await Promise.allSettled([...pollers.map((poller) => poller.stop())])
			this.events.emit('watchdogStopped')
			this.#running = false
		}
	}

	async destroy() {
		let pollers = [...this.nodePollerMap.values()]
		await Promise.allSettled([...pollers.map((poller) => poller.destroy())])
		this.events.emit('watchdogStopped')
		this.events.removeAllListeners()
		// console.log('The control protocol watchdog has been destroyed')
	}

	clearDependencies() {
		this.dependencyManager.clearMap()
	}

	addNode(nodeAddress: number) {
		if (!this.nodePollerMap.has(nodeAddress)) {
			// console.log(`ADDING NODE ${nodeAddress}`)
			let poller = new NodePoller(nodeAddress, () => this.#heartBeatCb(nodeAddress), this.options)
			this.nodePollerMap.set(nodeAddress, poller)
			poller.events.on('onlineStatus', (onlineStatus: NodeOnlineStatus) =>
				this.#handleNodeOnlineStatus(poller, onlineStatus)
			)
			poller.events.on('heartbeatMissed', () => {
				this.events.emit('nodeHeartbeatMissed', { node: nodeAddress, count: poller.hbMissed })
			})
			poller.events.on('heartbeatResponse', () => {
				this.events.emit('nodeHeartbeatResponse', { node: nodeAddress, count: poller.hbCount })
			})
			poller.start()
		}
	}

	removeNode(nodeAddress: number) {
		this.nodePollerMap.get(nodeAddress)?.destroy()
	}

	addNodeDependency(node: number, dependentId: string) {
		this.dependencyManager.addDependent(dependentId, node)
		this.addNode(node)
	}

	removeNodeDependency(dependentId: string) {
		let nodes = this.dependencyManager.getDependencies(dependentId)

		// For all the nodes that this dependent relies on
		nodes?.forEach((node) => {
			// Remove the dependency mapping
			this.dependencyManager.removeDependent(dependentId, node)
			// If the node no-longer has any dependents, remove it from watchdog
			if (this.dependencyManager.hasNoDependents(node)) this.removeNode(node)
		})
	}

	#handleNodeOnlineStatus(poller: NodePoller, onlineStatus: NodeOnlineStatus) {
		let report = this.#buildNodeReport()
		this.events.emit('nodeReportUpdate', report)
		this.#interpretConnectionStatus(report)
		this.events.emit('nodeOnlineStatus', { node: poller.node, onlineStatus: onlineStatus })
	}

	#buildNodeReport(): NodeReport {
		let report = {
			online: new Map(),
			offline: new Map(),
		}
		this.nodePollerMap.forEach((poller) => {
			if (poller.isOnline) {
				report.online.set(poller.node, { node: poller.node, onlineSince: poller.onlineSince })
			} else {
				report.offline.set(poller.node, { node: poller.node, offlineSince: poller.lastSeen })
			}
		})
		return report
	}

	#interpretConnectionStatus(report: NodeReport) {
		this.#setStatus(report.online.size > 0 ? true : false)
	}

	#setStatus(connected: boolean) {
		if (connected != this.#connnected) {
			this.#connnected = connected
			this.events.emit(
				'connectionStatus',
				this.#connnected ? ModuleConnectionStatus.CONNECTED : ModuleConnectionStatus.DISCONNECTED
			)
		}
	}

	handleHeartbeatResponse(node: number, value: number) {
		this.nodePollerMap.get(node)?.handleHeartbeatResponse(value)
	}
}

export class NodePoller {
	node: number
	#online: boolean = false
	// #lastResponse: null | Date = null
	#responseNotifier: ResponseNotifier<number | undefined> = new ResponseNotifier()
	events = createBasicEventEmitter<PollerEvents>()
	#running: boolean = false
	#stopFlag: boolean = false
	#hbCount: number = 0
	#hbMissed: number = 0
	options: { pollPeriod: number; offlineThreshold: number; onlineThreshold: number }

	lastSeen: number | null = null
	onlineSince: number | null = null

	#heartBeatCb: () => Promise<void>

	constructor(
		node: number,
		heartBeatFn: () => Promise<void>,
		options = {
			pollPeriod: 5000,
			offlineThreshold: 2,
			onlineThreshold: 2,
		}
	) {
		this.node = node
		this.#heartBeatCb = heartBeatFn
		this.options = options
	}

	get isRunning() {
		return this.#running
	}

	get isOnline() {
		return this.#online
	}

	get hbMissed() {
		return this.#hbMissed
	}

	get hbCount() {
		return this.#hbCount
	}

	start() {
		if (!this.#running) {
			this.events.emit('heartbeatStarted')
			this.#hbCount = 0
			this.#hbMissed = 0
			this.#running = true
			this.#heartBeatLoop()
		}
	}

	async stop() {
		if (this.isRunning && this.#stopFlag == false) {
			// Set the stop flag to signal to the loop to stop
			this.#stopFlag = true
			// Not sure how to make this next line properly typed.  Workaround casting as EventEmitter
			await once(this.events as EventEmitter, 'heartbeatStopped')
			// console.log('Control heartbeat has been stopped')
		}
	}

	async destroy() {
		await this.stop()
		this.events.removeAllListeners()
		this.#responseNotifier.destroy()
		// console.log(`The connection watchdog for node ${this.node} has been destroyed`)
	}

	async #heartBeatLoop() {
		await asynSetTimeout(1000) // Wait briefly for first heartbeat because first one is always dropped
		// console.log('Starting control heartbeat')
		while (!this.#stopFlag) {
			await this.#heartBeatQueryFn()
			await asynSetTimeout(this.options.pollPeriod) // Wait poll period and send again
		}
		this.#stopFlag = false
		this.#running = false
		this.events.emit('heartbeatStopped')
		// this.#responseNotifier.notifyResponse('stopped', undefined)
	}

	setStatus(online: boolean) {
		if (online != this.#online) {
			if (online) {
				this.onlineSince = Date.now()
			} else {
				this.onlineSince = null
			}
			this.#online = online
			this.events.emit('onlineStatus', this.#online ? NodeOnlineStatus.ONLINE : NodeOnlineStatus.OFFLINE)
		}
	}

	async #sendHeartbeat() {
		await this.#heartBeatCb()
	}

	async #heartBeatQueryFn() {
		this.#sendHeartbeat()
		let { data, error } = await this.#responseNotifier.response('heartbeat')
		// console.log('Heartbeat response', data)
		if (error) {
			this.#hbCount = 0
			this.#hbMissed += 1
			// this.#hbMissed = this.#hbMissed < 86400 ? this.#hbMissed + 1 : this.options.offlineThreshold // Clamp to 24hrs and start again
			this.events.emit('heartbeatMissed', {
				time: Date.now(),
				count: this.#hbMissed,
				threshold: this.options.offlineThreshold,
			})
			if (this.#hbMissed >= this.options.offlineThreshold) this.setStatus(false) // If we've missed >= 'offlineThreshold' consecutive heartbeats, we have lost comms
		} else {
			// console.log(`HEARTBEAT RESPONSE FOR NODE ${this.node} HANDLED`)

			this.#hbMissed = 0
			this.#hbCount += 1
			this.lastSeen = Date.now()
			// this.#hbMissed = this.#hbCount < 86400 ? this.#hbCount + 1 : this.options.onlineThreshold // Clamp to 24hrs and start again
			this.events.emit('heartbeatResponse', {
				time: this.lastSeen,
				data: data ?? null,
				count: this.#hbCount,
				threshold: this.options.onlineThreshold,
			})
			if (this.#hbCount >= this.options.onlineThreshold) this.setStatus(true) // If we've received >= 'onlineThreshold' consecutibe hearbeats, we have comms
		}
	}

	handleHeartbeatResponse(value: number) {
		this.#responseNotifier.setResponse('heartbeat', value)
	}
}
