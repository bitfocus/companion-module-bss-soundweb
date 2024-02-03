import { CompanionVariableDefinition, CompanionVariableValues } from '@companion-module/base'
import { DependentType } from './dependents'
import { ParameterUnit } from './parameters'
import * as sweb from './sweb'

// TODO Some of this probably needs refinement to de-couple it from parameters so other variables can be managed.

/**
 * Helper function to build a parameter variable ID
 */
export function buildVariableId(paramAddress: sweb.ParameterAddress, unit: ParameterUnit): string {
	let suffix: string
	switch (unit) {
		case ParameterUnit.RAW:
			suffix = '-RAW'
			break
		case ParameterUnit.DB:
			suffix = '-DB'
			break
		case ParameterUnit.PERCENT:
			suffix = '-PERCENT'
			break
		default:
			suffix = '-RAW'
	}
	return `${paramAddress.toString()}${suffix}`
}

/**
 * Helper function to return the parameter address from a variable ID
 */
export function parameterAddressFromVariableId(variableId: string) {
	return variableId.split('-')[0]
}

/**
 * Factory for creating a Parameter Variable Definition
 */
export function createParameterVariableDefinition(
	paramAddress: sweb.ParameterAddress,
	unit: ParameterUnit
): VariableDefinition {
	switch (unit) {
		case ParameterUnit.RAW:
			return new RawParameterVariableDefinition(paramAddress, unit)
		case ParameterUnit.DB:
			return new DBParameterVariableDefinition(paramAddress, unit)
		case ParameterUnit.PERCENT:
			return new PercentParameterVariableDefinition(paramAddress, unit)
		default:
			return new RawParameterVariableDefinition(paramAddress, unit)
	}
}

/**
 * A representation of a module variable definition
 */
export type VariableDefinition = {
	id: string
	name: string
	unit: ParameterUnit

	dependentsMap: Map<DependentType, Set<string>>

	getVariableValue(value: number): number | string

	registerDependent(type: DependentType, typeId: string): void
	deregisterDependent(type: DependentType, typeId: string): void

	hasDependents(): boolean
	hasNoDependents(): boolean
}

/**
 * Abstract base class for a variable defintion
 */
abstract class BaseParameterVariableDefinition implements VariableDefinition {
	id: string
	name: string
	unit: ParameterUnit

	abstract getVariableValue(value: number): number | string

	dependentsMap = new Map()

	constructor(paramAddress: sweb.ParameterAddress, unit: ParameterUnit) {
		this.unit = unit
		this.id = buildVariableId(paramAddress, this.unit)
		this.name = this.id
	}

	hasDependents(): boolean {
		let total = 0
		this.dependentsMap.forEach((regType) => {
			total += regType.size
		})
		return total > 0
	}

	hasNoDependents(): boolean {
		return !this.hasDependents()
	}

	registerDependent(depType: DependentType, depId: string) {
		// If we don't already have a mapping for this type of registration, add it
		if (!this.dependentsMap.has(depType)) {
			this.dependentsMap.set(depType, new Set())
		}
		this.dependentsMap.get(depType)?.add(depId)
		// console.log('depmap', [...this.dependentsMap])
	}

	deregisterDependent(type: DependentType, typeId: string) {
		this.dependentsMap.get(type)?.delete(typeId)
	}
}

/**
 * A variable defintion for a raw parameter value
 */
export class RawParameterVariableDefinition extends BaseParameterVariableDefinition {
	getVariableValue(value: number) {
		return value
	}
}

/**
 * A variable defintion for a parameter value with dB unit
 */
export class DBParameterVariableDefinition extends BaseParameterVariableDefinition {
	getVariableValue(rawValue: number) {
		if (rawValue == sweb.MINIMUM_GAIN_RAW_VALUE) return '-inf'
		let dBVal = sweb.rawToDb(rawValue)
		return Math.round(dBVal * 100) / 100
	}
}

/**
 * A variable defintion for a parameter value with % unit
 */
export class PercentParameterVariableDefinition extends BaseParameterVariableDefinition {
	getVariableValue(rawValue: number) {
		return Math.round(sweb.rawToPercent(rawValue) * 10) / 10
	}
}

type VariableDependentsMap = Map<DependentType, Map<string, Set<string>>>

/**
 * A manager for coordinating module variable definitions and their dependents
 */
export class VariableManager {
	variableDefinitionsMap: Map<string, VariableDefinition> = new Map() // Map of variableIds to definitions
	variableDependentsMap: VariableDependentsMap = new Map() // Map of feedbacks, actions and variables etc to variable IDs
	moduleVariableSetter: ModuleVariableSetter

	constructor(
		setModuleVariableDefinitionsFn: (variableDefinitions: CompanionVariableDefinition[]) => void,
		setModuleVariableValuesFn: (variableValues: CompanionVariableValues) => void
	) {
		this.moduleVariableSetter = new ModuleVariableSetter(
			setModuleVariableDefinitionsFn,
			setModuleVariableValuesFn,
			1000
		)
	}

	clearDefinitions() {
		this.variableDefinitionsMap = new Map()
		this.variableDependentsMap = new Map()
		this.moduleVariableSetter.reset()
	}

	getVariableDefinition(paramAddress: sweb.ParameterAddress, unit: ParameterUnit): VariableDefinition | undefined {
		let variableId = buildVariableId(paramAddress, unit)
		let variableDef = this.getVariableDefinitionFromId(variableId)
		return variableDef
	}

	getVariableDefinitionFromId(defId: string) {
		return this.variableDefinitionsMap.get(defId)
	}

	createVariableDefinition(paramAddress: sweb.ParameterAddress, unit: ParameterUnit) {
		let variableId = buildVariableId(paramAddress, unit)

		let possibleVariableDef = this.getVariableDefinition(paramAddress, unit)
		if (possibleVariableDef != undefined) return possibleVariableDef // We have already added this one so just return it

		let variableDef = createParameterVariableDefinition(paramAddress, unit)

		this.variableDefinitionsMap.set(variableId, variableDef)

		// Now update the module's variable definitions
		this.moduleVariableSetter.addVariableDefinition({ variableId: variableId, name: variableDef.name })

		return variableDef
	}

	removeVariableDefintion(variableId: string): boolean {
		let variableDef = this.getVariableDefinitionFromId(variableId)
		let res = this.variableDefinitionsMap.delete(variableId)

		// Now update the module's variable definitions
		this.moduleVariableSetter.removeVariableDefinition({ variableId: variableId, name: variableDef?.name ?? '' })
		return res
	}

	#purgeVariableDefinition(variableDef: VariableDefinition) {
		if (variableDef.hasNoDependents()) {
			return this.removeVariableDefintion(variableDef.id)
		}
		return false
	}

	updateModuleVariableValues(variableDefIds: string[], rawValue: number | string | null) {
		let updatedVariableValues: { [id: string]: string | number | boolean } = {}
		// Iterate over the supplied variable IDs and add the 'converted' value to the output object
		variableDefIds.forEach((defId) => {
			let def = this.getVariableDefinitionFromId(defId)
			if (def != undefined && typeof rawValue == 'number') {
				updatedVariableValues[def.id] = def.getVariableValue(rawValue)
			}
		})
		// Now update the module's variable values using the setter
		this.moduleVariableSetter.setVariableValues(updatedVariableValues)
	}

	// Deprecate?  Same as addVariableDefinition
	getOrCreateVariableDefinition(paramAddress: sweb.ParameterAddress, unit: ParameterUnit) {
		return this.getVariableDefinition(paramAddress, unit) ?? this.createVariableDefinition(paramAddress, unit)
	}

	#addVariableRegistration(type: DependentType, typeId: string, variableDef: VariableDefinition) {
		if (!this.variableDependentsMap.has(type)) {
			this.variableDependentsMap.set(type, new Map())
		}
		let variableDefIds = this.variableDependentsMap.get(type)?.get(typeId) ?? new Set([variableDef.id])
		this.variableDependentsMap.get(type)?.set(typeId, variableDefIds)
	}

	#popVariableRegistration(type: DependentType, typeId: string): Set<string> {
		let variableDefIds = this.variableDependentsMap.get(type)?.get(typeId) ?? new Set()
		this.variableDependentsMap.get(type)?.delete(typeId)
		return variableDefIds
	}

	registerDependent(depType: DependentType, depId: string, variableId: string) {
		let variableDef = this.getVariableDefinitionFromId(variableId)
		if (!variableDef) return
		this.#addVariableRegistration(depType, depId, variableDef)
		variableDef.registerDependent(depType, depId)
	}

	deregisterDependent(depType: DependentType, depId: string) {
		// Get the variable definitions associated with the given feedback/action/variable ID
		let variableDefIds = this.#popVariableRegistration(depType, depId)
		// For each parameter subscription, deregister/forget the given feedback/action/variable
		let purged: string[] = []
		let remaining: string[] = []
		variableDefIds.forEach((variableDefId) => {
			let variableDef = this.getVariableDefinitionFromId(variableDefId)
			if (!(variableDef == null)) {
				variableDef?.deregisterDependent(depType, depId)
				// Determine if this variable definition has any dependencies.  If not, get rid of it.
				let res = this.#purgeVariableDefinition(variableDef)
				if (res) {
					purged.push(variableDefId)
				} else {
					remaining.push(variableDefId)
				}
			}
		})
		return { remainingDefinitions: remaining, purgedDefinitions: purged }
	}
}

type BufferedDefinitions = {
	adding: Map<string, CompanionVariableDefinition>
	removing: Map<string, CompanionVariableDefinition>
}

/**
 * A means for buffering calls to set module variable definitions and values to improve efficiency.
 */
class ModuleVariableSetter {
	buffered = false
	bufferTime: number
	#bufferedDefinitions!: BufferedDefinitions
	#commitedDefinitions: Map<string, CompanionVariableDefinition> = new Map()
	#bufferedValues: CompanionVariableValues = {}
	#timer: NodeJS.Timeout | null = null
	#setModuleDefinitionsCallback: (defs: CompanionVariableDefinition[]) => void
	#setModuleVariableValuesCallback: (variables: CompanionVariableValues) => void

	constructor(
		setModuleVariableDefinitionsCb: (variableDefinitions: CompanionVariableDefinition[]) => void,
		setModuleVariableValuesCb: (variables: CompanionVariableValues) => void,
		bufferTime: number = 1000
	) {
		this.#setModuleDefinitionsCallback = setModuleVariableDefinitionsCb
		this.#setModuleVariableValuesCallback = setModuleVariableValuesCb
		this.bufferTime = bufferTime
		this.#initBufferedDefinitions()
	}

	// Resets the Setter object, but probably not going to be used, as one would probably just create a new Setter object
	reset() {
		this.#resetBuffer()
		this.#commitedDefinitions = new Map()
		this.#setDefinitions(false) // Set the definitions without buffering
	}

	// Lines up a variable definition to be commited to the module
	addVariableDefinition(definition: CompanionVariableDefinition) {
		if (!this.#commitedDefinitions.has(definition.variableId)) {
			this.#bufferedDefinitions.adding.set(definition.variableId, definition)
			this.#bufferedDefinitions.removing.delete(definition.variableId) // Just in case we have already done the opposite within buffer time
			this.#setDefinitions() // Sets off the timeout so definitions we have lined up will be set within bufferTime
		}
		// If the def is already commited to the module but we are about to remove it, ensure that doesn't happen
		else if (this.#bufferedDefinitions.removing.has(definition.variableId)) {
			this.#bufferedDefinitions.removing.delete(definition.variableId)
		}
	}

	removeVariableDefinition(definition: CompanionVariableDefinition) {
		if (this.#commitedDefinitions.has(definition.variableId)) {
			this.#bufferedDefinitions.removing.set(definition.variableId, definition)
			this.#bufferedDefinitions.adding.delete(definition.variableId) // Just in case we have already done the opposite within buffer time
			this.#setDefinitions()
		}
		// If the def is not already commited to the module and we were about to add it, ensure that doesn't happen
		else if (this.#bufferedDefinitions.adding.has(definition.variableId)) {
			this.#bufferedDefinitions.adding.delete(definition.variableId)
		}
	}

	#setDefinitions(buffer = true) {
		if (buffer) {
			// console.log('Buffering definitions...')
			if (!this.buffered) {
				this.#timer = setTimeout(() => this.#setDefinitionsToModule(), this.bufferTime)
				this.buffered = true
			}
		} else {
			this.#setDefinitionsToModule()
		}
	}

	#setDefinitionsToModule() {
		// console.log('adding', JSON.stringify([...this.#bufferedDefinitions.adding.entries()], null, 2))
		// console.log('removing', JSON.stringify([...this.#bufferedDefinitions.removing.entries()], null, 2))
		this.#bufferedDefinitions.removing.forEach((def) => this.#commitedDefinitions.delete(def.variableId))
		this.#bufferedDefinitions.adding.forEach((def) => this.#commitedDefinitions.set(def.variableId, def))
		this.#setModuleDefinitionsCallback([...this.#commitedDefinitions.values()])
		// Check to see if we have any values to set on our new definitions
		this.#setBufferedVariableValues()
		// Reset the buffer and ensure this method also doesn't get called again by another setTimeout
		this.#resetBuffer()
	}

	#resetBuffer() {
		if (this.#timer) {
			clearTimeout(this.#timer)
			this.#timer = null
		}
		this.#initBufferedDefinitions()
		this.#initBufferedValues()
		this.buffered = false
	}

	#initBufferedDefinitions() {
		this.#bufferedDefinitions = { adding: new Map(), removing: new Map() }
	}

	#initBufferedValues() {
		this.#bufferedValues = {}
	}

	#variableIdInBufferedValues(variableId: string) {
		return this.#bufferedDefinitions.adding.has(variableId)
	}

	setVariableValues(values: { [id: string]: string | number | boolean }) {
		let valuesToSetNow: { [id: string]: string | number | boolean } = {}
		// Filter out variables that we haven't defined on the module yet
		Object.entries(values).forEach((element) => {
			let [varId, value] = element
			// If the definition has already been set, we can set the value straight away
			if (this.#commitedDefinitions.has(varId)) {
				valuesToSetNow[varId] = value
				// If the definition is about to be added, just hold off on setting the values
			} else if (this.#variableIdInBufferedValues(varId)) {
				this.#bufferedValues[varId] = value
			}
		})
		if (Object.keys(valuesToSetNow).length > 0) {
			this.#setModuleVariableValuesCallback(valuesToSetNow)
		}
	}

	#setBufferedVariableValues() {
		if (Object.keys(this.#bufferedValues).length > 0) {
			this.#setModuleVariableValuesCallback(this.#bufferedValues)
			// this.#initBufferedValues()
		}
	}
}
