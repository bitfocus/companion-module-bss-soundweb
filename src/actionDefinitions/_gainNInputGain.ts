import { ModuleActionCallbacks, SoundwebActionDefinition } from '../actions'
import {
	ParameterSetType,
	channelSelectDropdown,
	fQObjectAddressOptionField,
	parseDbInput,
	parseEnumInput,
	parseNumberInput,
	parseParameterAddressFromFQAddress,
	setTypeOptionField,
	unitOptionField,
} from '../options'
import { ParameterUnit } from '../parameters'
import { ParameterAddress } from '../sweb'
import { getRegexRange } from '../utils'

type OptionInputs = {
	fqObjectAddress: string
	channel: number
	value: string
	setType: ParameterSetType
	unit: ParameterUnit
}

type ParsedOptionValues = {
	paramAddress: ParameterAddress
	value: number
	setType: ParameterSetType
	unit: ParameterUnit
}

export default function (
	moduleCallbacks: ModuleActionCallbacks
): SoundwebActionDefinition<OptionInputs, ParsedOptionValues> {
	return {
		actionId: 'gainNInput_gain',

		name: 'Gain N-Input: Gain control',

		options: [
			fQObjectAddressOptionField(),
			channelSelectDropdown(32),
			{
				id: 'value',
				type: 'textinput',
				label: 'Level',
				default: '0',
				useVariables: true,
				regex: `/^(${getRegexRange(-80, 100)}(\\.${getRegexRange(0, 99)})?|-inf)$/`,
			},
			unitOptionField(ParameterUnit.DB, [ParameterUnit.DB, ParameterUnit.PERCENT]),
			setTypeOptionField(ParameterSetType.ABSOLUTE, [ParameterSetType.ABSOLUTE, ParameterSetType.RELATIVE]),
		],

		parseOptions: async ({ action, context }) => {
			let channelParam = (await parseNumberInput(context, action.options.channel)) - 1
			let paramAddress = await parseParameterAddressFromFQAddress(
				context,
				`${action.options.fqObjectAddress}.${channelParam}`
			)
			let setType = parseEnumInput(action.options.setType, ParameterSetType)
			let unit = parseEnumInput(action.options.unit, ParameterUnit)
			let value

			switch (unit) {
				case ParameterUnit.DB:
					value = await parseDbInput(context, action.options.value)
					break
				default:
					value = await parseNumberInput(context, action.options.value)
			}
			return {
				paramAddress: paramAddress,
				setType: setType,
				unit: unit,
				value: value,
			}
		},

		callback: async ({ options }) => {
			let { paramAddress, value, setType, unit } = options

			// // We must subscribe here incase a variable has changed in the object address
			// await moduleCallbacks.subscribe(action, paramAddress, ParameterUnit.RAW)

			// Now set the gain value
			await moduleCallbacks.setParameterValue(paramAddress, setType, value, unit)
		},

		// TODO provide separate subscribe methods for parameters and just informing the module of a new action
		// For now, we must subscribe/unsubscribe so the connection watchdog can do its thing.
		subscribe: async ({ action, options }) => {
			let { paramAddress, unit } = options
			await moduleCallbacks.subscribe(action, paramAddress, unit)
		},

		unsubscribe: async ({ action }) => {
			await moduleCallbacks.unsubscribe(action)
		},
	}
}
