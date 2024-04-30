import { InputValue } from '@companion-module/base'
import { ModuleFeedbackCallbacks, SoundwebFeedbackDefinition } from '../feedbacks'
import {
	fQParameterAddressOptionField,
	parseEnumInput,
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
	unit: ParameterUnit
	variableTag: InputValue
}

type ParsedOptionValues = {
	fqParamAddress: ParameterAddress
	unit: ParameterUnit
	variableTag?: string
}

export default function (
	moduleCallbacks: ModuleFeedbackCallbacks
): SoundwebFeedbackDefinition<OptionInputs, ParsedOptionValues> {
	return {
		feedbackId: 'addParameterVariable',
		name: 'Add Parameter Variable',
		type: 'boolean',
		defaultStyle: {}, // Pass a blank style deliberately because we don't want this feedback to do anything
		options: [fQParameterAddressOptionField(), unitOptionField(), variableTagOptionField()],

		parseOptions: async ({ feedback, context }) => {
			let parameterAddress = await parseParameterAddressFromFQAddress(context, feedback.options.fqParamAddress)
			let unit = parseEnumInput(feedback.options.unit, ParameterUnit)
			let variableTag = await parseStringInput(feedback.options.variableTag, {
				regex: new RegExp(variableTagRegExp),
				required: false,
			})

			return {
				fqParamAddress: parameterAddress,
				unit: unit,
				variableTag: variableTag,
			}
		},

		callback: async ({ options, feedback }) => {
			let { fqParamAddress, unit } = options

			// We need to subscribe the feedback here to support variables that may have been updated in options
			await moduleCallbacks.subscribe(feedback, fqParamAddress, unit, true, options.variableTag)

			// Just return false, because we don't want the feedback to do anything as such
			return false
		},

		subscribe: async ({ feedback, options }) => {
			let { fqParamAddress, unit } = options
			await moduleCallbacks.subscribe(feedback, fqParamAddress, unit, true, options.variableTag)
		},

		unsubscribe: async ({ feedback }) => {
			await moduleCallbacks.unsubscribe(feedback)
		},
	}
}
