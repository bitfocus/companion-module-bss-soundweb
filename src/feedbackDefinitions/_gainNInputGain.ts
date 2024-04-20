import { combineRgb } from '@companion-module/base'
import { ModuleFeedbackCallbacks, SoundwebFeedbackDefinition } from '../feedbacks'
import {
	ComparisonOptionValues,
	channelSelectDropdown,
	comparisonOperatorOption,
	createVariableOptionField,
	fQObjectAddressOptionField,
	parseCheckboxInput,
	parseEnumInput,
	parseNumberInput,
	parseParameterAddressFromFQAddress,
	unitOptionField,
} from '../options'
import { ParameterUnit } from '../parameters'
import { ParameterAddress } from '../sweb'

type OptionInputs = {
	fqObjectAddress: string
	channel: number
	value: string
	comparisonOperator: string
	unit: ParameterUnit
	createVariable: boolean
}

type ParsedOptionValues = {
	fqParamAddress: ParameterAddress
	value: number
	comparisonOperator: ComparisonOptionValues
	unit: ParameterUnit
	createVariable: boolean
}

export default function (
	moduleCallbacks: ModuleFeedbackCallbacks
): SoundwebFeedbackDefinition<OptionInputs, ParsedOptionValues> {
	return {
		feedbackId: 'gainNInput_gain',
		name: 'Gain N-Input: Gain',
		type: 'boolean',
		defaultStyle: {
			bgcolor: combineRgb(0, 204, 0),
			color: combineRgb(0, 0, 0),
		},
		options: [
			fQObjectAddressOptionField(),
			channelSelectDropdown(32),
			comparisonOperatorOption(),
			{
				id: 'value',
				type: 'textinput',
				label: 'Level',
				default: '0',
				useVariables: true,
				regex: '/^-?\\d+|-inf$/',
			},
			unitOptionField(ParameterUnit.DB, [ParameterUnit.DB, ParameterUnit.PERCENT]),
			createVariableOptionField(),
		],

		parseOptions: async ({ feedback, context }) => {
			let channelParam = (await parseNumberInput(context, feedback.options.channel)) - 1
			let paramAddress = await parseParameterAddressFromFQAddress(
				context,
				`${feedback.options.fqObjectAddress}.${channelParam}`
			)
			let value = await parseNumberInput(context, feedback.options.value)
			let comparisonOperator = parseEnumInput(feedback.options.comparisonOperator, ComparisonOptionValues)
			let unit = parseEnumInput(feedback.options.unit, ParameterUnit)
			let createVariable = parseCheckboxInput(feedback.options.createVariable)

			return {
				fqParamAddress: paramAddress,
				comparisonOperator: comparisonOperator,
				value: value,
				unit: unit,
				createVariable: createVariable,
			}
		},

		callback: async ({ options, feedback }) => {
			let { fqParamAddress, value, unit, comparisonOperator, createVariable } = options

			// We need to subscribe the feedback here to support variables that may have been updated in options
			await moduleCallbacks.subscribe(feedback, fqParamAddress, unit, createVariable)

			// Get the current gain value
			let currentState = await moduleCallbacks.getParameterValue(fqParamAddress, unit)

			// Check that we are not dealing 
			if (typeof currentState != 'number') {

				return false

			}
			switch (comparisonOperator) {
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
					throw Error(
						`Unhandled comparison operator: ${comparisonOperator} during callback of Feedback: ${feedback.feedbackId}`
					)
			}
		},

		subscribe: async ({ feedback, options }) => {
			let { fqParamAddress, unit, createVariable } = options
			await moduleCallbacks.subscribe(feedback, fqParamAddress, unit, createVariable)
		},

		unsubscribe: async ({ feedback }) => {
			await moduleCallbacks.unsubscribe(feedback)
		},
	}
}
