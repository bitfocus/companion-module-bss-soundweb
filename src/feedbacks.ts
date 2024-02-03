import {
	CompanionFeedbackBooleanEvent,
	CompanionFeedbackContext,
	CompanionFeedbackDefinitions,
	CompanionFeedbackInfo,
	Regex,
	combineRgb,
} from '@companion-module/base'
import { SoundwebModuleInstance } from './main'
import {
	ComparisonOptionValues,
	FailedOptionsParsingResult,
	OptionsParsingResult,
	ParsingError,
	buttonOption,
	channelSelectDropdown,
	comparisonOperationOption,
	createVariableOption,
	fullyQualifiedObjectAddressOption,
	fullyQualifiedParameterAddressOption,
	parseButtonInput,
	parseCheckboxInput,
	parseEnumInput,
	parseNumberInput,
	parseParameterAddressFromFQAddress,
	unitOption,
} from './options'
import { ParameterUnit } from './parameters'

function handleFeedbackOptionsParsingError(err: any, feedback: CompanionFeedbackInfo): FailedOptionsParsingResult {
	if (err instanceof ParsingError) {
		return {
			success: false,
			error: `Error parsing options for feedback "${feedback.feedbackId}" @ ${feedback.controlId} (${feedback.id}): ${err.message}`,
		}
	} else {
		return {
			success: false,
			error: `Unknown error while parsing options for feedback "${feedback.feedbackId}" @ ${feedback.controlId} (${feedback.id}): ${err.message}`,
		}
	}
}

async function parseOptionsForComparisonFeedback(
	feedback: CompanionFeedbackInfo,
	context: CompanionFeedbackContext
): Promise<OptionsParsingResult> {
	try {
		let parameterAddress = await parseParameterAddressFromFQAddress(context, feedback.options.fqParamAddress)
		let value = await parseNumberInput(context, feedback.options.value)
		let comparisonOperation = parseEnumInput(feedback.options.comparisonOperation, ComparisonOptionValues)
		let unit = parseEnumInput(feedback.options.unit, ParameterUnit)
		let createVariable = parseCheckboxInput(feedback.options.createVariable)
		return {
			success: true,
			options: {
				parameterAddress: parameterAddress,
				value: value,
				comparisonOperation: comparisonOperation,
				unit: unit,
				createVariable: createVariable,
			},
		}
	} catch (err) {
		return handleFeedbackOptionsParsingError(err, feedback)
	}
}

async function parseOptionsForParameterVariableFeedback(
	feedback: CompanionFeedbackInfo,
	context: CompanionFeedbackContext
): Promise<OptionsParsingResult> {
	try {
		let parameterAddress = await parseParameterAddressFromFQAddress(context, feedback.options.fqParamAddress)
		let unit = parseEnumInput(feedback.options.unit, ParameterUnit)
		return {
			success: true,
			options: {
				parameterAddress: parameterAddress,
				unit: unit,
			},
		}
	} catch (err) {
		return handleFeedbackOptionsParsingError(err, feedback)
	}
}

async function parseOptionsForGainNInputGainFeedback(
	feedback: CompanionFeedbackInfo,
	context: CompanionFeedbackContext
): Promise<OptionsParsingResult> {
	try {
		let channelParam = (await parseNumberInput(context, feedback.options.channel)) - 1
		let parameterAddress = await parseParameterAddressFromFQAddress(
			context,
			`${feedback.options.fqObjectAddress}.${channelParam}`
		)
		let value = await parseNumberInput(context, feedback.options.value)
		let comparisonOperation = parseEnumInput(feedback.options.comparisonOperation, ComparisonOptionValues)
		let unit = parseEnumInput(feedback.options.unit, ParameterUnit)
		let createVariable = parseCheckboxInput(feedback.options.createVariable)

		return {
			success: true,
			options: {
				parameterAddress: parameterAddress,
				value: value,
				comparisonOperation: comparisonOperation,
				unit: unit,
				createVariable: createVariable,
				channelParam: channelParam,
			},
		}
	} catch (err) {
		return handleFeedbackOptionsParsingError(err, feedback)
	}
}

async function parseOptionsForGainNInputMuteFeedback(
	feedback: CompanionFeedbackInfo,
	context: CompanionFeedbackContext
): Promise<OptionsParsingResult> {
	try {
		let channelParam = (await parseNumberInput(context, feedback.options.channel)) - 1
		let muteParam = channelParam + 32

		let paramAddress = await parseParameterAddressFromFQAddress(
			context,
			`${feedback.options.fqObjectAddress}.${muteParam}`
		)
		let buttonValue = parseButtonInput(feedback.options.buttonValue)
		let createVariable = parseCheckboxInput(feedback.options.createVariable)

		return {
			success: true,
			options: {
				paramAddress: paramAddress,
				buttonValue: buttonValue,
				createVariable: createVariable,
			},
		}
	} catch (err) {
		return handleFeedbackOptionsParsingError(err, feedback)
	}
}

export default function (module: SoundwebModuleInstance): CompanionFeedbackDefinitions {
	return {
		// Custom Parameter Comparison
		comparison: {
			name: 'Custom Parameter',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 204, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				fullyQualifiedParameterAddressOption,
				comparisonOperationOption(),
				{
					id: 'value',
					type: 'textinput',
					label: 'Value',
					default: '0',
					regex: Regex.SIGNED_FLOAT,
					required: true,
					useVariables: true,
				},
				unitOption(),
				createVariableOption(),
			],
			callback: async (feedback: CompanionFeedbackBooleanEvent, context: CompanionFeedbackContext) => {
				// module.log('debug', `Feedback: ${feedback.feedbackId}: ${feedback.id} triggered`)
				let parsed = await parseOptionsForComparisonFeedback(feedback, context)
				if (parsed.success == false) {
					module.log('error', parsed.error)
					return false
				}

				let { parameterAddress, value, unit, comparisonOperation, createVariable } = parsed.options

				// We need to subscribe the feedback here to support variables that may have been updated in options
				await module.subscribeFeedback(feedback, parameterAddress, unit, createVariable)

				let currentState = await module.getParameterValue(parameterAddress, unit)

				if (currentState == null) return false

				switch (comparisonOperation) {
					case ComparisonOptionValues.LESS_THAN:
						return currentState < value
					case ComparisonOptionValues.GREATER_THAN:
						return currentState > value
					case ComparisonOptionValues.GREATER_THAN_EQUAL:
						return currentState >= value
					case ComparisonOptionValues.LESS_THAN_EQUAL:
						return currentState <= value
					case ComparisonOptionValues.EQUAL:
						return currentState == value
					default:
						throw Error(`Unhandled error during callback of Feedback: ${feedback.feedbackId}`)
				}
			},

			subscribe: async (feedback: CompanionFeedbackInfo, context: CompanionFeedbackContext) => {
				let optionsParsingResult = await parseOptionsForComparisonFeedback(feedback, context)
				if (optionsParsingResult.success == false) {
					module.log('error', optionsParsingResult.error)
					return
				}
				let { parameterAddress, unit, createVariable } = optionsParsingResult.options
				await module.subscribeFeedback(feedback, parameterAddress, unit, createVariable)
			},

			unsubscribe: async (feedback: CompanionFeedbackInfo) => {
				await module.unsubscribeFeedback(feedback)
			},
		},

		// Custom Parameter Variable
		parameterVariable: {
			name: 'Parameter Variable',
			type: 'boolean',
			defaultStyle: {},
			options: [fullyQualifiedParameterAddressOption, unitOption()],
			callback: async (feedback: CompanionFeedbackBooleanEvent, context: CompanionFeedbackContext) => {
				// module.log('debug', `Feedback: ${feedback.feedbackId}: ${feedback.id} triggered`)
				let parsed = await parseOptionsForParameterVariableFeedback(feedback, context)
				if (parsed.success == false) {
					module.log('error', parsed.error)
					return false
				}

				let { parameterAddress, unit } = parsed.options

				// We need to subscribe the feedback here to support variables that may have been updated in options
				await module.subscribeFeedback(feedback, parameterAddress, unit, true)
				return false
			},

			subscribe: async (feedback: CompanionFeedbackInfo, context: CompanionFeedbackContext) => {
				let optionsParsingResult = await parseOptionsForParameterVariableFeedback(feedback, context)
				if (optionsParsingResult.success == false) {
					module.log('error', optionsParsingResult.error)
					return
				}
				let { parameterAddress, unit } = optionsParsingResult.options
				await module.subscribeFeedback(feedback, parameterAddress, unit, true)
			},

			unsubscribe: async (feedback: CompanionFeedbackInfo) => {
				await module.unsubscribeFeedback(feedback)
			},
		},

		// GAIN N-INPUT: GAIN
		gain_n_input_gain: {
			name: 'Gain N-Input: Gain',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 204, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				fullyQualifiedObjectAddressOption,
				channelSelectDropdown(32),
				comparisonOperationOption(),
				{
					id: 'value',
					type: 'textinput',
					label: 'Level',
					default: '0',
					useVariables: true,
					regex: '/^-?\\d+|-inf$/',
				},
				unitOption(ParameterUnit.DB, [ParameterUnit.DB, ParameterUnit.PERCENT]),
				createVariableOption(),
			],
			callback: async (feedback: CompanionFeedbackBooleanEvent, context: CompanionFeedbackContext) => {
				// module.log('debug', `Feedback: ${feedback.feedbackId}: ${feedback.id} triggered`)
				let parsed = await parseOptionsForGainNInputGainFeedback(feedback, context)
				if (parsed.success == false) {
					module.log('error', parsed.error)
					return false
				}

				let { parameterAddress, value, unit, comparisonOperation, createVariable } = parsed.options

				// We need to subscribe the feedback here to support variables that may have been updated in options
				await module.subscribeFeedback(feedback, parameterAddress, unit, createVariable)

				let currentState = await module.getParameterValue(parameterAddress, unit)

				if (currentState == null) return false

				switch (comparisonOperation) {
					case ComparisonOptionValues.LESS_THAN:
						return currentState < value
					case ComparisonOptionValues.GREATER_THAN:
						return currentState > value
					case ComparisonOptionValues.GREATER_THAN_EQUAL:
						return currentState >= value
					case ComparisonOptionValues.LESS_THAN_EQUAL:
						return currentState <= value
					case ComparisonOptionValues.EQUAL:
						return currentState == value
					default:
						throw Error(`Unhandled error during callback of Feedback: ${feedback.feedbackId}`)
				}
			},

			subscribe: async (feedback: CompanionFeedbackInfo, context: CompanionFeedbackContext) => {
				let optionsParsingResult = await parseOptionsForGainNInputGainFeedback(feedback, context)
				if (optionsParsingResult.success == false) {
					module.log('error', optionsParsingResult.error)
					return
				}
				let { parameterAddress, unit, createVariable } = optionsParsingResult.options
				await module.subscribeFeedback(feedback, parameterAddress, unit, createVariable)
			},

			unsubscribe: async (feedback: CompanionFeedbackInfo) => {
				await module.unsubscribeFeedback(feedback)
			},
		},
		// GAIN N-INPUT: MUTE
		gain_n_input_mute: {
			name: 'Gain N-Input: Mute',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(255, 255, 255),
			},
			options: [
				fullyQualifiedObjectAddressOption,
				channelSelectDropdown(32),
				buttonOption({
					label: 'Mute on/off',
					choices: [
						{ id: 0, label: 'Off' },
						{ id: 1, label: 'On' },
					],
				}),
				createVariableOption(),
			],
			callback: async (feedback: CompanionFeedbackBooleanEvent, context: CompanionFeedbackContext) => {
				// module.log('debug', `Feedback: ${feedback.feedbackId}: ${feedback.id} triggered`)
				let parsed = await parseOptionsForGainNInputMuteFeedback(feedback, context)
				if (parsed.success == false) {
					module.log('error', parsed.error)
					return false
				}

				let { paramAddress, buttonValue, createVariable } = parsed.options

				// We need to subscribe the feedback here to support variables that may have been updated in options
				await module.subscribeFeedback(feedback, paramAddress, ParameterUnit.RAW, createVariable)

				let currentState = await module.getParameterValue(paramAddress, ParameterUnit.RAW)

				if (currentState == null) return false

				return currentState == buttonValue
			},

			subscribe: async (feedback: CompanionFeedbackInfo, context: CompanionFeedbackContext) => {
				let optionsParsingResult = await parseOptionsForGainNInputMuteFeedback(feedback, context)
				if (optionsParsingResult.success == false) {
					module.log('error', optionsParsingResult.error)
					return
				}
				let { paramAddress, createVariable } = optionsParsingResult.options
				await module.subscribeFeedback(feedback, paramAddress, ParameterUnit.RAW, createVariable)
			},

			unsubscribe: async (feedback: CompanionFeedbackInfo) => {
				await module.unsubscribeFeedback(feedback)
			},
		},
	}
}
