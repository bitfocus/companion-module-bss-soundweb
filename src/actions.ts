import {
	CompanionActionContext,
	CompanionActionDefinition,
	CompanionActionDefinitions,
	CompanionActionEvent,
	CompanionActionInfo,
	CompanionOptionValues,
	LogLevel,
	SomeCompanionActionInputField,
} from '@companion-module/base'
import { buttonLocationLogString } from './logging'
import { OptionsParsingResult, ParameterSetType, ParsedOptionValues, ParsingError } from './options'
import { ParameterUnit } from './parameters'
import { ParameterAddress } from './sweb'

// A lot of this complexity is to accomodate existential ActionDefinition types by wrapping ActionDefinition<T, T2> instances
type WrappedActionDefinition = <R>(
	cb: <ActionOptionInputs extends CompanionOptionValues, OptionValues extends ParsedOptionValues>(
		item: (moduleMethods: ModuleActionCallbacks) => SoundwebActionDefinition<ActionOptionInputs, OptionValues>
	) => R
) => R

type WrappedActionDefinitions = WrappedActionDefinition[]

/**
 * Function for creating a wrapped ActionDefinition
 */
export function useActionDefinition<
	OptionInputs extends CompanionOptionValues,
	OptionValues extends ParsedOptionValues
>(
	actionDefinitionFn: (moduleMethods: ModuleActionCallbacks) => SoundwebActionDefinition<OptionInputs, OptionValues>
): WrappedActionDefinition {
	return (cb) => cb(actionDefinitionFn)
}

/**
 * A more specific CompanionActionDefinition for Soundwebs with type parameters
 */
export type SoundwebCompanionActionDefinition<ActionOptionInputs extends CompanionOptionValues> =
	CompanionActionDefinition & {
		callback: (action: SoundwebActionEvent<ActionOptionInputs>, context: CompanionActionContext) => Promise<void> | void
		subscribe?: (
			action: SoundwebActionInfo<ActionOptionInputs>,
			context: CompanionActionContext
		) => Promise<void> | void
		unsubscribe?: (
			action: SoundwebActionInfo<ActionOptionInputs>,
			context: CompanionActionContext
		) => Promise<void> | void
	}

/**
 * Function for building Companion action definitions from our own definitions
 */
export function buildCompanionActionDefintions(
	moduleCallbacks: ModuleActionCallbacks,
	wrappedActionDefinitions: WrappedActionDefinitions
): CompanionActionDefinitions {
	let companionActionDefs: CompanionActionDefinitions = {}

	wrappedActionDefinitions.forEach((wrappedActionDef) => {
		wrappedActionDef((actionDefFn) => {
			let actionProvider = new SoundwebActionDefinitionProvider(moduleCallbacks, actionDefFn)
			let { actionId, actionDefinition } = actionProvider.buildCompanionDefinition()
			companionActionDefs[actionId] = actionDefinition
		})
	})

	return companionActionDefs
}

/**
 * Module callbacks for actions to use in their definitions
 */
export type ModuleActionCallbacks = {
	subscribe: (action: CompanionActionInfo, paramAddress: ParameterAddress, unit: ParameterUnit) => Promise<void>
	unsubscribe: (action: CompanionActionInfo) => Promise<void>
	setParameterValue: (
		paramAddress: ParameterAddress,
		setType: ParameterSetType,
		value: number,
		unit?: ParameterUnit
	) => Promise<void>
	setToggle: (
		paramAddress: ParameterAddress,
		unit: ParameterUnit,
		toggleValues?: Array<number | string>
	) => Promise<void>
	log: (level: LogLevel, msg: string) => void
}

export type SoundwebActionInfo<Opts extends CompanionOptionValues> = CompanionActionInfo & {
	readonly options: CompanionOptionValues | Opts // We must provide this union to avoid sub-type error
}

export type SoundwebActionEvent<Opts extends CompanionOptionValues> =
	| CompanionActionEvent & {
			readonly options: CompanionOptionValues | Opts // We must provide this union to avoid sub-type error
	  }

type SoundwebActionInputField<ID> = SomeCompanionActionInputField & {
	id: ID
}

/**
 * Our own definition object for defining our actions
 */
export type SoundwebActionDefinition<
	ActionOptionInputs extends CompanionOptionValues,
	ActionOptionValues extends ParsedOptionValues
> = {
	actionId: string

	name: string

	description?: string

	options: SoundwebActionInputField<keyof ActionOptionInputs>[]

	parseOptions: (props: {
		action: SoundwebActionInfo<ActionOptionInputs>
		context: CompanionActionContext
	}) => Promise<ActionOptionValues>

	callback: (props: {
		action: SoundwebActionEvent<ActionOptionInputs>
		context: CompanionActionContext
		options: ActionOptionValues
	}) => Promise<void>

	subscribe?: (props: {
		action: SoundwebActionInfo<ActionOptionInputs>
		context: CompanionActionContext
		options: ActionOptionValues
	}) => Promise<void>

	unsubscribe?: (props: {
		action: SoundwebActionInfo<ActionOptionInputs>
		context: CompanionActionContext
		options: ActionOptionValues
	}) => Promise<void>
}

/**
 * A provider for Companion Action Definitions from our specialised Soundweb Action Definitions
 */
class SoundwebActionDefinitionProvider<
	OptionInputs extends CompanionOptionValues,
	OptionValues extends ParsedOptionValues
> {
	#definition: SoundwebActionDefinition<OptionInputs, OptionValues>

	constructor(
		public moduleCallbacks: ModuleActionCallbacks,
		definitionFn: (moduleCallbacks: ModuleActionCallbacks) => SoundwebActionDefinition<OptionInputs, OptionValues>
	) {
		this.#definition = definitionFn(moduleCallbacks)
	}

	async #parseOptions(
		action: CompanionActionInfo,
		context: CompanionActionContext
	): Promise<OptionsParsingResult<OptionValues>> {
		try {
			let options = await this.#definition.parseOptions({ action: action, context: context }) // << Throws if there is a parsing error
			return {
				success: true,
				options: options,
			}
		} catch (err) {
			if (err instanceof ParsingError) {
				return {
					success: false,
					error: `Error parsing options for action '${action.actionId}' @ ${await buttonLocationLogString(
						action,
						context
					)}: ${err.message}`,
				}
			} else {
				return {
					success: false,
					error: `Unknown error while parsing options for action '${action.actionId}' @ ${await buttonLocationLogString(
						action,
						context
					)}`,
				}
			}
		}
	}

	async #subscribe(action: SoundwebActionInfo<OptionInputs>, context: CompanionActionContext): Promise<void> {
		if (this.#definition.subscribe == undefined) return
		let parseResult = await this.#parseOptions(action, context)
		if (parseResult.success == false) return this.moduleCallbacks.log('error', parseResult.error)

		let location = await buttonLocationLogString(action, context)
		this.moduleCallbacks.log(
			'debug',
			`[ACTION SUBSCRIBING] '${action.actionId}' @ ${(location = '' ? action.controlId : location)}`
		)

		await this.#definition.subscribe({
			action: action,
			context: context,
			options: parseResult.options,
		})
	}

	async #unsubscribe(action: SoundwebActionInfo<OptionInputs>, context: CompanionActionContext): Promise<void> {
		if (this.#definition.unsubscribe == undefined) return
		let parseResult = await this.#parseOptions(action, context)
		if (parseResult.success == false) return this.moduleCallbacks.log('error', parseResult.error)

		let location = await buttonLocationLogString(action, context)
		this.moduleCallbacks.log(
			'debug',
			`[ACTION UNSUBSCRIBING] '${action.actionId}' @ ${(location = '' ? action.controlId : location)}`
		)

		await this.#definition.unsubscribe({
			action: action,
			context: context,
			options: parseResult.options,
		})
	}

	async #callback(action: CompanionActionEvent, context: CompanionActionContext): Promise<void> {
		let parseResult = await this.#parseOptions(action, context)
		if (parseResult.success == false) return this.moduleCallbacks.log('error', parseResult.error)

		let triggerDetails = action.surfaceId?.includes('trigger')
			? `@ Trigger:'${action.surfaceId}'`
			: `@ Surface:'${action.surfaceId}', ${await buttonLocationLogString(action, context)}`

		this.moduleCallbacks.log('info', `[ACTION TRIGGERED] '${action.actionId}' ${triggerDetails}`)

		try {
			await this.#definition.callback({
				action: action,
				context: context,
				options: parseResult.options,
			})
		} catch (error) {
			this.moduleCallbacks.log(
				'error',
				`There was an error triggering the action '${action.actionId}' @ ${triggerDetails}.  Error message: ${error}`
			)
		}
	}

	buildCompanionDefinition(): { actionId: string; actionDefinition: CompanionActionDefinition } {
		return {
			actionId: this.#definition.actionId,
			actionDefinition: {
				name: this.#definition.name,
				options: this.#definition.options,
				description: this.#definition.description,
				callback: (action: CompanionActionEvent, context: CompanionActionContext) => this.#callback(action, context),
				subscribe: (action: CompanionActionInfo, context: CompanionActionContext) => this.#subscribe(action, context),
				unsubscribe: (action: CompanionActionInfo, context: CompanionActionContext) =>
					this.#unsubscribe(action, context),
			},
		}
	}
}
