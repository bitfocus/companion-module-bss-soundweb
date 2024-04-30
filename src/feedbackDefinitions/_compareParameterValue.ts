import { InputValue, Regex, combineRgb } from '@companion-module/base'
import { ModuleFeedbackCallbacks, SoundwebFeedbackDefinition } from '../feedbacks'
import {
	ComparisonOptionValues,
	comparisonOperatorOption,
	createVariableOptionField,
	fQParameterAddressOptionField,
	parseCheckboxInput,
	parseEnumInput,
	parseNumberInput,
	parseParameterAddressFromFQAddress,
	parseStringInput,
	unitOptionField,
	variableTagOptionField,
	variableTagRegExp,
} from '../options'
import { ParameterUnit } from '../parameters'
import { ParameterAddress } from '../sweb'

type OptionInputs = {
	fqParamAddress: InputValue
	comparisonOperator: string
	value: InputValue
	unit: ParameterUnit
	createVariable: boolean
	variableTag: InputValue
}

type ParsedOptionValues = {
	fqParamAddress: ParameterAddress
	comparisonOperator: ComparisonOptionValues
	value: number
	unit: ParameterUnit
	createVariable: boolean
	variableTag?: string
}

export default function (
	moduleCallbacks: ModuleFeedbackCallbacks
): SoundwebFeedbackDefinition<OptionInputs, ParsedOptionValues> {
	return {
		feedbackId: 'compareParameterValue',
		name: 'Compare Parameter Value',
		type: 'boolean',
		defaultStyle: {
			bgcolor: combineRgb(0, 204, 0),
			color: combineRgb(0, 0, 0),
		},

		options: [
			fQParameterAddressOptionField(),
			comparisonOperatorOption(),
			{
				id: 'value',
				type: 'textinput',
				label: 'Value',
				default: '0',
				regex: Regex.SIGNED_FLOAT,
				required: true,
				useVariables: true,
			},
			unitOptionField(),
			createVariableOptionField(),
			variableTagOptionField(),
		],

		parseOptions: async ({ feedback, context }) => {
			let paramAddress = await parseParameterAddressFromFQAddress(context, feedback.options.fqParamAddress)
			let value = await parseNumberInput(context, feedback.options.value)
			let comparisonOperator = parseEnumInput(feedback.options.comparisonOperator, ComparisonOptionValues)
			let unit = parseEnumInput(feedback.options.unit, ParameterUnit)
			let createVariable = parseCheckboxInput(feedback.options.createVariable)
			let variableTag = await parseStringInput(feedback.options.variableTag, {
				regex: new RegExp(variableTagRegExp),
				required: false,
			})

			return {
				fqParamAddress: paramAddress,
				comparisonOperator: comparisonOperator,
				value: value,
				unit: unit,
				createVariable: createVariable,
				variableTag: variableTag,
			}
		},

		callback: async ({ options, feedback }) => {
			let { fqParamAddress, value, unit, comparisonOperator, createVariable } = options

			// We need to subscribe the feedback here to support variables that may have been updated in options
			await moduleCallbacks.subscribe(feedback, fqParamAddress, unit, createVariable, options.variableTag)

			// Get the current state of the parameter
			let currentState = await moduleCallbacks.getParameterValue(fqParamAddress, unit)

			// Check to make sure we are dealing with a number and not something else
			if (typeof currentState != 'number') return false

			// Depending on the feedback's option for the choice of operator, return a feedback result
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
			await moduleCallbacks.subscribe(feedback, fqParamAddress, unit, createVariable, options.variableTag)
		},

		unsubscribe: async ({ feedback }) => {
			await moduleCallbacks.unsubscribe(feedback)
		},
	}
}
