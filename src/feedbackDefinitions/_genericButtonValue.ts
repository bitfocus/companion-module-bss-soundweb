import { combineRgb } from '@companion-module/base'
import { ModuleFeedbackCallbacks, SoundwebFeedbackDefinition } from '../feedbacks'
import {
	buttonValueSelectionOptionField,
	createVariableOptionField,
	fQParameterAddressOptionField,
	parseCheckboxInput,
	parseParameterAddressFromFQAddress,
	validateButtonInput,
} from '../options'
import { ParameterUnit } from '../parameters'
import { ParameterAddress } from '../sweb'

type OptionInputs = {
	fqParamAddress: string
	buttonValue: string
	createVariable: boolean
}

type ParsedOptionValues = {
	fqParamAddress: ParameterAddress
	buttonValue: 0 | 1
	createVariable: boolean
}

export default function (
	moduleCallbacks: ModuleFeedbackCallbacks
): SoundwebFeedbackDefinition<OptionInputs, ParsedOptionValues> {
	return {
		feedbackId: 'genericButton',
		name: 'Generic Button',
		type: 'boolean',
		defaultStyle: {
			bgcolor: combineRgb(0, 204, 0),
			color: combineRgb(0, 0, 0),
		},

		options: [
			fQParameterAddressOptionField(),
			buttonValueSelectionOptionField({
				label: 'On/off',
				default: 1,
				choices: [
					{ id: 0, label: 'Off' },
					{ id: 1, label: 'On' },
				],
			}),
			createVariableOptionField(),
		],

		parseOptions: async ({ feedback, context }) => {
			let paramAddress = await parseParameterAddressFromFQAddress(context, feedback.options.fqParamAddress)
			let buttonValue = validateButtonInput(feedback.options.buttonValue)
			let createVariable = parseCheckboxInput(feedback.options.createVariable)

			return {
				fqParamAddress: paramAddress,
				buttonValue: buttonValue,
				createVariable: createVariable,
			}
		},

		callback: async ({ options, feedback }) => {
			let { fqParamAddress, buttonValue, createVariable } = options

			// We need to subscribe the feedback here to support variables that may have been updated in options
			await moduleCallbacks.subscribe(feedback, fqParamAddress, ParameterUnit.RAW, createVariable)

			// Get the current state of the parameter
			let currentState = await moduleCallbacks.getParameterValue(fqParamAddress, ParameterUnit.RAW)

			// Check to make sure we are dealing with a number and not something else
			if (typeof currentState != 'number') return false

			// Depending on the feedback's option for the choice of operator, return a feedback result
			return currentState == buttonValue
		},

		subscribe: async ({ feedback, options }) => {
			let { fqParamAddress, createVariable } = options
			await moduleCallbacks.subscribe(feedback, fqParamAddress, ParameterUnit.RAW, createVariable)
		},

		unsubscribe: async ({ feedback }) => {
			await moduleCallbacks.unsubscribe(feedback)
		},
	}
}
