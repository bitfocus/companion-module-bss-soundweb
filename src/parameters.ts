import { DependentType } from './dependents'
import { ResponseNotification, ResponseNotifier } from './responseNotifier'
import * as sweb from './sweb'

/**
 * Represents the two types of Parameter Subscription.
 */
export enum ParameterSubscriptionType {
	RAW,
	PERCENT,
}

/**
 * Represents the various units that a parameter can have.
 */
export enum ParameterUnit {
	RAW,
	DB,
	PERCENT,
	BOOL,
	FREQ,
}

/**
 * Helper function to create a suffix for a parameter subscription ID
 */
export function paramSubIdSuffixFromSubscriptionType(subscriptionType: ParameterSubscriptionType) {
	if (subscriptionType == ParameterSubscriptionType.RAW) {
		return ':STD'
	} else {
		return ':PC'
	}
}

/**
 * Helper function to determine the appropriate parameter subscription type from a given unit
 */
export function parameterSubscriptionTypeFromUnit(unit: ParameterUnit) {
	if (unit == ParameterUnit.PERCENT) {
		return ParameterSubscriptionType.PERCENT
	} else {
		return ParameterSubscriptionType.RAW
	}
}

/**
 * An object representing a map of Dependent Types to an array of Dependent IDs
 */
type ParameterDependentsMap = {
	[id in DependentType]?: string[]
}

/**
 * A notification object sent to signal a change in value and which dependents need notifying
 */
export type ParameterValueChangeNotification = {
	value: number
	dependents: ParameterDependentsMap
}

/**
 * Map to list parameter IDs associated with various types of dependent e.g. feedbacks/actions/variables etc
 */
type ParameterSubscriptionRegistrationMap = Map<DependentType, Map<string, Set<string>>>

/**
 * A manager for coordinating device parameter subscriptions
 */
export class ParameterSubscriptionManager {
	paramSubMap: Map<string, ParameterSubscription> = new Map()
	paramAddressMap: Map<string, Set<string>> = new Map() // Map of parameter addresses to parameter subscriptions
	paramSubDependentsMap: ParameterSubscriptionRegistrationMap = new Map() // Map of dependents (feedbacks/actions etc) to parameter subscriptions
	nodeMap: Map<number, Set<string>> = new Map() // Map of node addresses to parameter subscriptions for keeping track of node connections
	responseNotifier: ResponseNotifier<number> = new ResponseNotifier()

	// #sendToDevice: (buf: Buffer) => void
	#deviceSubscribe: (paramAddress: sweb.ParameterAddress, subType: ParameterSubscriptionType) => void
	#deviceUnsubscribe: (paramAddress: sweb.ParameterAddress, subType: ParameterSubscriptionType) => void
	#valueChangedCallback: (notifications: ParameterValueChangeNotification) => void

	constructor(
		// sendToDeviceFn: (buf: Buffer) => void,
		deviceSubscribe: (paramAddress: sweb.ParameterAddress, subType: ParameterSubscriptionType) => void,
		deviceUnsubscribe: (paramAddress: sweb.ParameterAddress, subType: ParameterSubscriptionType) => void,
		valueChangedCallback: (notifications: ParameterValueChangeNotification) => void
	) {
		// this.#sendToDevice = sendToDeviceFn
		this.#deviceSubscribe = deviceSubscribe
		this.#deviceUnsubscribe = deviceUnsubscribe
		this.#valueChangedCallback = valueChangedCallback
	}

	subscribeToDevice(sub: ParameterSubscription) {
		this.#deviceSubscribe(sub.parameterAddress, sub.type)
	}

	unsubscribeFromDevice(sub: ParameterSubscription) {
		this.#deviceUnsubscribe(sub.parameterAddress, sub.type)
	}

	reSubscribeAll() {
		this.paramSubMap.forEach((paramSub) => {
			this.subscribeToDevice(paramSub)
		})
	}

	unsubscribeAll() {
		// Try to unsubscribe from all device parameters
		this.paramSubMap.forEach((paramSub) => {
			this.unsubscribeFromDevice(paramSub)
		})
		this.clearSubscriptions()
	}

	clearSubscriptions() {
		this.paramSubMap = new Map()
		this.paramSubDependentsMap = new Map()
		this.paramAddressMap = new Map()
	}

	getParameterSubscription(paramId: string) {
		return this.paramSubMap.get(paramId)
	}

	hasParamId(paramId: string) {
		return this.paramSubMap.has(paramId)
	}

	#addNodeMapping(node: number, paramSubId: string) {
		if (this.nodeMap.get(node)) {
			// If we already know about this node, add to the paramSub mapping
			this.nodeMap.get(node)?.add(paramSubId)
		} else {
			// If we haven't seen this node before, create a new mapping
			this.nodeMap.set(node, new Set([paramSubId]))
		}
	}

	#removeNodeMapping(node: number, paramSubId: string) {
		this.nodeMap.get(node)?.delete(paramSubId)
		// If we have no more mappings, we do not need this node anymore
		if (this.nodeMap.get(node)?.size == 0) {
			this.nodeMap.delete(node)
		}
	}

	subscribeNodeParameters(node: number) {
		let paramSubIds = this.nodeMap.get(node) ?? new Set()
		paramSubIds.forEach((paramSubId) => {
			let paramSub = this.getParameterSubscription(paramSubId)
			if (paramSub) this.subscribeToDevice(paramSub)
		})
	}

	#createParameterSubscription(
		paramId: string,
		paramAddress: sweb.ParameterAddress,
		subscriptionType: ParameterSubscriptionType
	) {
		let newParamSub = new ParameterSubscription(paramId, paramAddress, subscriptionType)
		let addrString = paramAddress.toString()

		// Create/set all the mappings
		this.paramSubMap.set(paramId, newParamSub)
		let set = this.paramAddressMap.get(addrString) ?? new Set()
		set.add(newParamSub.id)
		this.paramAddressMap.set(addrString, set)
		this.#addNodeMapping(paramAddress.node, newParamSub.id)

		// Subscribe to the device
		this.subscribeToDevice(newParamSub)

		return newParamSub
	}

	#getOrCreateParameterSubscription(
		paramId: string,
		paramAddress: sweb.ParameterAddress,
		subscriptionType: ParameterSubscriptionType
	) {
		// Return it if it exists... otherwise, create one with respective mappings etc
		if (this.hasParamId(paramId)) {
			return this.getParameterSubscription(paramId)! // ! == non-null assertion
		} else {
			return this.#createParameterSubscription(paramId, paramAddress, subscriptionType)
		}
	}

	#removeParameterSubscription(paramSub: ParameterSubscription) {
		// Remove the subscription itself
		this.paramSubMap.delete(paramSub.id)
		// Remove the mapping to the param address
		let paramAddrString = paramSub.parameterAddress.toString()
		let set = this.paramAddressMap.get(paramAddrString) ?? new Set()
		set?.delete(paramSub.id)
		if (set.size == 0) {
			this.paramAddressMap.delete(paramAddrString)
		}
		this.#removeNodeMapping(paramSub.parameterAddress.node, paramSub.id)

		// Unsubscribe from the device
		this.unsubscribeFromDevice(paramSub)
	}

	#purgeParameterSubscription(parameterSubscription: ParameterSubscription) {
		// If the parameter subscription no-longer has any dependents, we can remove it.
		if (parameterSubscription.hasNoDependents()) this.#removeParameterSubscription(parameterSubscription)
	}

	#getParamSubIdFromUnit(paramAddress: sweb.ParameterAddress, unit: ParameterUnit): string {
		let paramSubIdSuffix: string
		paramSubIdSuffix = paramSubIdSuffixFromSubscriptionType(parameterSubscriptionTypeFromUnit(unit))
		return `${paramAddress.toString()}${paramSubIdSuffix}`
	}

	#getParamSubIdFromSubscriptionType(paramAddress: sweb.ParameterAddress, subscriptionType: ParameterSubscriptionType) {
		return `${paramAddress.toString()}${paramSubIdSuffixFromSubscriptionType(subscriptionType)}`
	}

	#parameterSubscriptionFromAddressAndUnit(paramAddress: sweb.ParameterAddress, unit: ParameterUnit) {
		let paramId = this.#getParamSubIdFromUnit(paramAddress, unit)
		let subscriptionType = parameterSubscriptionTypeFromUnit(unit)
		return this.#getOrCreateParameterSubscription(paramId, paramAddress, subscriptionType)
	}

	#addParamSubRegistration(depType: DependentType, depId: string, paramSub: ParameterSubscription) {
		if (!this.paramSubDependentsMap.has(depType)) {
			this.paramSubDependentsMap.set(depType, new Map())
		}
		let paramIds = this.paramSubDependentsMap.get(depType)?.get(depId) ?? new Set([paramSub.id])
		this.paramSubDependentsMap.get(depType)?.set(depId, paramIds)
	}

	#popParamSubDependent(depType: DependentType, depId: string): Set<string> {
		let paramSubIds = this.paramSubDependentsMap.get(depType)?.get(depId) ?? new Set()
		this.paramSubDependentsMap.get(depType)?.delete(depId)
		return paramSubIds
	}

	registerDependent(depType: DependentType, depId: string, paramAddress: sweb.ParameterAddress, unit: ParameterUnit) {
		// Get (and create if necessary) the parameter subscription
		let paramSub = this.#parameterSubscriptionFromAddressAndUnit(paramAddress, unit)
		// Register the dependent so it will receive notifications of updates
		this.#addParamSubRegistration(depType, depId, paramSub)
		// Is below necessary?
		paramSub.registerDependent(depType, depId)
	}

	deregisterDependent(depType: DependentType, depId: string) {
		// Get the parameter subscriptions associated with the given feedback/action/variable ID
		let paramSubIds = this.#popParamSubDependent(depType, depId)
		// For each parameter subscription, deregister/forget the given feedback/action/variable
		paramSubIds.forEach((paramSubId) => {
			let paramSub = this.paramSubMap.get(paramSubId)
			if (!(paramSub == null)) {
				paramSub?.deregister(depType, depId)
				// Determine if this parameter subscription has any dependencies and if not, unsubscribe from the device
				this.#purgeParameterSubscription(paramSub)
			}
		})
	}

	setCachedParameterValue(
		paramAddress: sweb.ParameterAddress,
		subscriptionType: ParameterSubscriptionType,
		value: number
	) {
		let paramId = this.#getParamSubIdFromSubscriptionType(paramAddress, subscriptionType)
		let paramSub = this.#getOrCreateParameterSubscription(paramId, paramAddress, subscriptionType)
		// If the value has changed, notify the module via the callback
		if (value != paramSub.value) {
			paramSub.setValue(value)
			let dependentsMap: ParameterDependentsMap = {}
			paramSub.dependentRegistrations.forEach((paramSubs, type) => {
				dependentsMap[type] = [...paramSubs.keys()]
			})
			this.#valueChangedCallback({
				value: value,
				dependents: dependentsMap,
			})
		}
		// Notify anything waiting for this value
		this.responseNotifier.setResponse(paramId, value)
	}

	getCachedParameterValue(paramAddress: sweb.ParameterAddress, subscriptionType: ParameterSubscriptionType) {
		let paramId = this.#getParamSubIdFromSubscriptionType(paramAddress, subscriptionType)
		let paramSub = this.#getOrCreateParameterSubscription(paramId, paramAddress, subscriptionType)
		return paramSub.value
	}

	async getParameterValue(
		paramAddress: sweb.ParameterAddress,
		subscriptionType: ParameterSubscriptionType
	): Promise<ResponseNotification<number | null>> {
		let paramId = this.#getParamSubIdFromSubscriptionType(paramAddress, subscriptionType)
		let paramSub = this.#getOrCreateParameterSubscription(paramId, paramAddress, subscriptionType)

		// Return the cached value if we already have it
		if (paramSub.value != null) return { data: paramSub.value, error: null }

		// Otherwise, request it from the device
		this.subscribeToDevice(paramSub)
		return await this.responseNotifier.response(paramId)
	}

	updateCachedParameterValueFromDevice(paramAddress: sweb.ParameterAddress) {
		let subs = this.paramAddressMap.get(paramAddress.toString()) ?? new Set()
		subs.forEach((sub: string) => {
			// Use the 'subscribe' command on the device to force it to send the current value back to us.
			this.subscribeToDevice(this.paramSubMap.get(sub)!)
		})
	}
}

/**
 * An object for holding the parameter value and references to its dependents
 */
export class ParameterSubscription {
	id: string
	parameterAddress: sweb.ParameterAddress
	type: ParameterSubscriptionType

	dependentRegistrations: Map<DependentType, Set<string>> = new Map()

	value: number | null = null

	constructor(id: string, paramAddress: sweb.ParameterAddress, type: ParameterSubscriptionType) {
		this.id = id
		this.parameterAddress = paramAddress
		this.type = type
	}

	setValue(val: number) {
		this.value = val
	}

	getValue(): number | null {
		return this.value
	}

	hasDependents(): boolean {
		let total = 0
		this.dependentRegistrations.forEach((regType) => {
			total += regType.size
		})
		return total > 0
		// return this.feedbacks.size + this.actions.size + this.variables.size > 0
	}

	hasNoDependents(): boolean {
		return !this.hasDependents()
	}

	registerDependent(depType: DependentType, depId: string) {
		// If we don't already have a mapping for this type of registration, add it
		if (!this.dependentRegistrations.has(depType)) {
			this.dependentRegistrations.set(depType, new Set())
		}
		this.dependentRegistrations.get(depType)?.add(depId)
	}

	deregister(depType: DependentType, depId: string) {
		this.dependentRegistrations.get(depType)?.delete(depId)
	}
}
