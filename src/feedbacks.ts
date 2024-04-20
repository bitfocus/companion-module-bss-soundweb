import {
	CompanionFeedbackBooleanEvent,
	CompanionFeedbackButtonStyleResult,
	CompanionFeedbackContext,
	CompanionFeedbackDefinition,
	CompanionFeedbackDefinitions,
	CompanionFeedbackInfo,
	CompanionOptionValues,
	LogLevel,
	SomeCompanionFeedbackInputField,
} from '@companion-module/base'
import { OptionsParsingResult, ParsedOptionValues, ParsingError } from './options'
import { ParameterUnit } from './parameters'
import { ParameterAddress } from './sweb'

// TODO There's a lot of repetition/similarities between feedbacks and actions.

// A lot of this complexity is to accomodate existential ActionDefinition types by wrapping ActionDefinition<T, T2> instances
type WrappedFeedbackDefinition = <R>(
	cb: <OptionInputs extends CompanionOptionValues, OptionValues extends ParsedOptionValues>(
		item: (moduleMethods: ModuleFeedbackCallbacks) => SoundwebFeedbackDefinition<OptionInputs, OptionValues>
	) => R
) => R

type WrappedFeedbackDefinitions = WrappedFeedbackDefinition[]

/**
 * Function for creating a wrapped ActionDefinition
 */
export function useFeedbackDefinition<
	OptionInputs extends CompanionOptionValues,
	OptionValues extends ParsedOptionValues
>(
	feedbackDefinitionFn: (
		moduleCallbacks: ModuleFeedbackCallbacks
	) => SoundwebFeedbackDefinition<OptionInputs, OptionValues>
): WrappedFeedbackDefinition {
	return (cb) => cb(feedbackDefinitionFn)
}

/**
 * Module callbacks for actions to use in their definitions
 */
export type ModuleFeedbackCallbacks = {
	subscribe: (
		feedback: CompanionFeedbackInfo,
		paramAddress: ParameterAddress,
		unit: ParameterUnit,
		createVariable?: boolean
	) => Promise<void>
	unsubscribe: (feedback: CompanionFeedbackInfo) => Promise<void>
	getParameterValue: (
		paramAddress: ParameterAddress,
		unit: ParameterUnit,
		returnRaw?: boolean
	) => Promise<string | number | null>
	log: (level: LogLevel, msg: string) => void
}

export type SoundwebFeedbackInfo<Opts extends CompanionOptionValues> = CompanionFeedbackInfo & {
	readonly options: CompanionOptionValues | Opts // We must provide this union to avoid sub-type error
}

export type SoundwebBooleanFeedbackEvent<Opts extends CompanionOptionValues> = CompanionFeedbackBooleanEvent & {
	readonly options: CompanionOptionValues | Opts // We must provide this union to avoid sub-type error
}

type SoundwebFeedbackInputField<ID> = SomeCompanionFeedbackInputField & {
	id: ID
}

/**
 * A more specific CompanionFeedbackDefinition for Soundwebs with type parameters
 */
export type SoundwebCompanionFeedbackDefinition<OptionInputs extends CompanionOptionValues> =
	CompanionFeedbackDefinition & {
		callback: (
			action: SoundwebBooleanFeedbackEvent<OptionInputs>,
			context: CompanionFeedbackContext
		) => Promise<void> | void
		subscribe?: (action: SoundwebFeedbackInfo<OptionInputs>, context: CompanionFeedbackContext) => Promise<void> | void
		unsubscribe?: (
			action: SoundwebFeedbackInfo<OptionInputs>,
			context: CompanionFeedbackContext
		) => Promise<void> | void
	}

/**
 * Function for building Companion action definitions from our own definitions
 */
export function buildCompanionFeedbackDefintions(
	moduleCallbacks: ModuleFeedbackCallbacks,
	wrappedDefinitions: WrappedFeedbackDefinitions
): CompanionFeedbackDefinitions {
	let companionFeedbackDefs: CompanionFeedbackDefinitions = {}

	wrappedDefinitions.forEach((wrappedFeedbackDef) => {
		wrappedFeedbackDef((feedbackDefFn) => {
			let feedbackProvider = new SoundwebFeedbackDefinitionProvider(moduleCallbacks, feedbackDefFn)
			let { feedbackId, feedbackDefinition } = feedbackProvider.buildCompanionDefinition()
			companionFeedbackDefs[feedbackId] = feedbackDefinition
		})
	})

	return companionFeedbackDefs
}

/**
 * Our own definition object for defining our feedbacks
 */
export type SoundwebFeedbackDefinition<
	OptionInputs extends CompanionOptionValues,
	OptionValues extends ParsedOptionValues
> = {
	feedbackId: string

	name: string

	type: 'boolean' | 'advanced'

	description?: string

	defaultStyle: Partial<CompanionFeedbackButtonStyleResult>

	options: SoundwebFeedbackInputField<keyof OptionInputs>[]

	parseOptions: (props: {
		feedback: SoundwebFeedbackInfo<OptionInputs>
		context: CompanionFeedbackContext
	}) => Promise<OptionValues>

	callback: (props: {
		feedback: SoundwebBooleanFeedbackEvent<OptionInputs>
		context: CompanionFeedbackContext
		options: OptionValues
	}) => Promise<boolean>

	subscribe?: (props: {
		feedback: SoundwebFeedbackInfo<OptionInputs>
		context: CompanionFeedbackContext
		options: OptionValues
	}) => Promise<void>

	unsubscribe?: (props: {
		feedback: SoundwebFeedbackInfo<OptionInputs>
		context: CompanionFeedbackContext
		options: OptionValues
	}) => Promise<void>
}

/**
 * A provider for Companion Feedback Definitions from our specialised Soundweb Feedback Definitions
 */
class SoundwebFeedbackDefinitionProvider<
	OptionInputs extends CompanionOptionValues,
	OptionValues extends ParsedOptionValues
> {
	#definition: SoundwebFeedbackDefinition<OptionInputs, OptionValues>

	constructor(
		public moduleCallbacks: ModuleFeedbackCallbacks,
		definitionFn: (moduleCallbacks: ModuleFeedbackCallbacks) => SoundwebFeedbackDefinition<OptionInputs, OptionValues>
	) {
		this.#definition = definitionFn(moduleCallbacks)
	}

	async #parseOptions(
		feedback: CompanionFeedbackInfo,
		context: CompanionFeedbackContext
	): Promise<OptionsParsingResult<OptionValues>> {
		try {
			let options = await this.#definition.parseOptions({ feedback: feedback, context: context }) // << Throws if there is a parsing error
			return {
				success: true,
				options: options,
			}
		} catch (err) {
			if (err instanceof ParsingError) {
				return {
					success: false,
					error: `Error parsing options for feedback "${feedback.feedbackId}" @ ${feedback.controlId}: ${
						err.message
					} ${JSON.stringify(feedback.options)}`,
				}
			} else {
				return {
					success: false,
					error: `Unknown error while parsing options for feedback "${feedback.feedbackId}" @ ${
						feedback.controlId
					}: ${err} ${JSON.stringify(feedback.options)}`,
				}
			}
		}
	}

	async #subscribe(feedback: SoundwebFeedbackInfo<OptionInputs>, context: CompanionFeedbackContext): Promise<void> {
		if (this.#definition.subscribe == undefined) return
		let parseResult = await this.#parseOptions(feedback, context)
		if (parseResult.success == false) return this.moduleCallbacks.log('error', parseResult.error)
		this.moduleCallbacks.log('debug', `FEEDBACK SUBSCRIBED: "${feedback.feedbackId}" @ ${feedback.controlId}`)
		await this.#definition.subscribe({
			feedback: feedback,
			context: context,
			options: parseResult.options,
		})
	}

	async #unsubscribe(feedback: SoundwebFeedbackInfo<OptionInputs>, context: CompanionFeedbackContext): Promise<void> {
		if (this.#definition.unsubscribe == undefined) return
		let parseResult = await this.#parseOptions(feedback, context)
		if (parseResult.success == false) return this.moduleCallbacks.log('error', parseResult.error)
		this.moduleCallbacks.log('debug', `FEEDBACK UNSUBSCRIBED: "${feedback.feedbackId}" @ ${feedback.controlId}`)
		await this.#definition.unsubscribe({
			feedback: feedback,
			context: context,
			// moduleCallbacks: this.moduleCallbacks,
			options: parseResult.options,
		})
	}

	async #callback(
		feedback: SoundwebBooleanFeedbackEvent<OptionInputs>,
		context: CompanionFeedbackContext
	): Promise<boolean> {
		let parseResult = await this.#parseOptions(feedback, context)

		if (parseResult.success == false) {
			this.moduleCallbacks.log('error', parseResult.error)
			return false
		}

		// If options are successfully parsed...
		this.moduleCallbacks.log('debug', `FEEDBACK TRIGGERED: "${feedback.feedbackId}" @ ${feedback.controlId}`)

		let result
		try {
			result = await this.#definition.callback({
				feedback: feedback,
				context: context,
				options: parseResult.options,
			})
		} catch (error) {
			this.moduleCallbacks.log(
				'error',
				`There was an error calling the feedback "${feedback.feedbackId}".  Error message: ${error}`
			)
		}

		return result != undefined ? result : false
	}

	buildCompanionDefinition(): { feedbackId: string; feedbackDefinition: CompanionFeedbackDefinition } {
		return {
			feedbackId: this.#definition.feedbackId,
			feedbackDefinition: {
				name: this.#definition.name,
				type: 'boolean', // We're only supporting Boolean feedbacks atm
				defaultStyle: this.#definition.defaultStyle,
				options: this.#definition.options,
				description: this.#definition.description,
				callback: async (feedback: CompanionFeedbackBooleanEvent, context: CompanionFeedbackContext) => {
					return await this.#callback(feedback, context)
				},
				subscribe: async (feedback: CompanionFeedbackInfo, context: CompanionFeedbackContext) =>
					await this.#subscribe(feedback, context),
				unsubscribe: async (feedback: CompanionFeedbackInfo, context: CompanionFeedbackContext) =>
					await this.#unsubscribe(feedback, context),
			},
		}
	}
}
