import { ModuleActionCallbacks, SoundwebActionDefinition } from '../actions'
import {
	DefaultButtonValues,
	ParameterSetType,
	buttonValueSelectionOptionField,
	fQParameterAddressOptionField,
	parseParameterAddressFromFQAddress,
	validateButtonInput,
} from '../options'
import { ParameterUnit } from '../parameters'
import { ParameterAddress } from '../sweb'

type OptionFieldInputValues = {
	fqParamAddress: string
	buttonValue: DefaultButtonValues
}

type ParsedOptionValues = {
	paramAddress: ParameterAddress
	buttonValue: DefaultButtonValues
}

export default function (
	moduleCallbacks: ModuleActionCallbacks
): SoundwebActionDefinition<OptionFieldInputValues, ParsedOptionValues> {
	return {
		actionId: 'genericButton',

		name: 'Generic Button',

		options: [fQParameterAddressOptionField(), buttonValueSelectionOptionField({ label: 'On/off/toggle' })],

		parseOptions: async ({ action, context }) => {
			let paramAddress = await parseParameterAddressFromFQAddress(context, action.options.fqParamAddress)
			if (action.options.buttonValue == undefined) throw Error('misc')
			let buttonValue = await validateButtonInput(action.options.buttonValue)
			return {
				paramAddress: paramAddress,
				buttonValue: buttonValue,
			}
		},

		callback: async ({ options }) => {
			let { paramAddress, buttonValue } = options

			// // We must subscribe here incase a variable has changed in the object address
			// await moduleCallbacks.subscribe(action, paramAddress, ParameterUnit.RAW)

			// Now either set a value or toggle the value
			if (buttonValue == 'TOGGLE') {
				await moduleCallbacks.setToggle(paramAddress, ParameterUnit.RAW)
			} else {
				await moduleCallbacks.setParameterValue(paramAddress, ParameterSetType.ABSOLUTE, buttonValue)
			}
		},

		// We must subscribe/unsubscribe so connection watchdog can do its thing
		subscribe: async ({ action, options }) => {
			let { paramAddress } = options
			await moduleCallbacks.subscribe(action, paramAddress, ParameterUnit.RAW)
		},

		unsubscribe: async ({ action }) => {
			await moduleCallbacks.unsubscribe(action)
		},
	}
}
