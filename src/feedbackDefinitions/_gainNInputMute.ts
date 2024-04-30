import { InputValue, combineRgb } from '@companion-module/base'
import { ModuleFeedbackCallbacks, SoundwebFeedbackDefinition } from '../feedbacks'
import {
	buttonValueSelectionOptionField,
	channelSelectDropdown,
	createVariableOptionField,
	fQObjectAddressOptionField,
	parseCheckboxInput,
	parseNumberInput,
	parseParameterAddressFromFQAddress,
	parseStringInput,
	validateButtonInput,
	variableTagOptionField,
	variableTagRegExp,
} from '../options'
import { ParameterUnit } from '../parameters'
import { ParameterAddress } from '../sweb'

type OptionInputs = {
	fqObjectAddress: InputValue
	channel: number
	buttonValue: string
	createVariable: boolean
	variableTag: InputValue
}

type ParsedOptionValues = {
	fqParamAddress: ParameterAddress
	buttonValue: 0 | 1
	createVariable: boolean
	variableTag?: string
}

export default function (
	moduleCallbacks: ModuleFeedbackCallbacks
): SoundwebFeedbackDefinition<OptionInputs, ParsedOptionValues> {
	return {
		feedbackId: 'gainNInput_mute',
		name: 'Gain N-Input: Mute',
		type: 'boolean',
		defaultStyle: {
			bgcolor: combineRgb(255, 0, 0),
			color: combineRgb(255, 255, 255),
		},
		options: [
			fQObjectAddressOptionField(),
			channelSelectDropdown(32),
			buttonValueSelectionOptionField({
				label: 'Mute on/off',
				choices: [
					{ id: 0, label: 'Off' },
					{ id: 1, label: 'On' },
				],
			}),
			createVariableOptionField(),
			variableTagOptionField(),
		],

		parseOptions: async ({ feedback, context }) => {
			let channelParam = (await parseNumberInput(context, feedback.options.channel)) - 1
			let muteParam = channelParam + 32

			let paramAddress = await parseParameterAddressFromFQAddress(
				context,
				`${feedback.options.fqObjectAddress}.${muteParam}`
			)
			let buttonValue = validateButtonInput(feedback.options.buttonValue)
			let createVariable = parseCheckboxInput(feedback.options.createVariable)
			let variableTag = await parseStringInput(feedback.options.variableTag, {
				regex: new RegExp(variableTagRegExp),
				required: false,
			})

			return {
				fqParamAddress: paramAddress,
				buttonValue: buttonValue,
				createVariable: createVariable,
				variableTag: variableTag,
			}
		},

		callback: async ({ options, feedback }) => {
			let { fqParamAddress, buttonValue, createVariable } = options

			// We need to subscribe the feedback here to support variables that may have been updated in options
			await moduleCallbacks.subscribe(feedback, fqParamAddress, ParameterUnit.RAW, createVariable, options.variableTag)

			let currentState = await moduleCallbacks.getParameterValue(fqParamAddress, ParameterUnit.RAW)

			if (currentState == null) return false

			return currentState == buttonValue
		},

		subscribe: async ({ feedback, options }) => {
			let { fqParamAddress, createVariable } = options
			await moduleCallbacks.subscribe(feedback, fqParamAddress, ParameterUnit.RAW, createVariable, options.variableTag)
		},

		unsubscribe: async ({ feedback }) => {
			await moduleCallbacks.unsubscribe(feedback)
		},
	}
}
