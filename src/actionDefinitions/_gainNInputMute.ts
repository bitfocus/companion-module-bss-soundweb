import { ModuleActionCallbacks, SoundwebActionDefinition } from '../actions'
import {
	DefaultButtonValues,
	ParameterSetType,
	buttonValueSelectionOptionField,
	channelSelectDropdown,
	fQObjectAddressOptionField,
	parseNumberInput,
	parseParameterAddressFromFQAddress,
	validateButtonInput,
} from '../options'
import { ParameterUnit } from '../parameters'
import { ParameterAddress } from '../sweb'

type OptionFieldInputValues = {
	fqObjectAddress: string
	channel: number
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
		actionId: 'gainNInput_mute',
		name: 'Gain N-Input: Mute control',
		options: [
			fQObjectAddressOptionField(),
			channelSelectDropdown(32),
			buttonValueSelectionOptionField({
				label: 'Mute on/off',
			}),
		],

		parseOptions: async ({ action, context }) =>
			{
				let channelParam = (await parseNumberInput(context, action.options.channel)) - 1
				let muteParam = channelParam + 32
				let paramAddress = await parseParameterAddressFromFQAddress(
					context,
					`${action.options.fqObjectAddress}.${muteParam}`
				)
				let buttonValue = validateButtonInput(action.options.buttonValue)

				return {
					paramAddress: paramAddress,
					buttonValue: buttonValue,
				}
			},

		callback: async ({ options }) => {
			let { paramAddress, buttonValue } = options

			// // We must subscribe here incase a variable has changed in the object address
			// await moduleCallbacks.subscribe(action, paramAddress, ParameterUnit.RAW)
			
			// Now either set a mute value or toggle it
			if (buttonValue == 'TOGGLE') {
				await moduleCallbacks.setToggle(paramAddress, ParameterUnit.RAW)
			} else {
				await moduleCallbacks.setParameterValue(paramAddress, ParameterSetType.ABSOLUTE, buttonValue)
			}
		},

		// subscribe: async ({ action, options }) => {
		// 	let { paramAddress } = options
		// 	await moduleCallbacks.subscribe(action, paramAddress, ParameterUnit.RAW)
		// },

		// unsubscribe: async ({ action }) => {
		// 	await moduleCallbacks.unsubscribe(action)
		// },
	}
}
