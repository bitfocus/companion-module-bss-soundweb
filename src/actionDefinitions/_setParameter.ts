import { ModuleActionCallbacks, SoundwebActionDefinition } from '../actions'
import {
	ParameterSetType,
	fQParameterAddressOptionField,
	parseDbInput,
	parseEnumInput,
	parseNumberInput,
	parseParameterAddressFromFQAddress,
	setTypeOptionField,
	unitOptionField,
} from '../options'
import { ParameterUnit } from '../parameters'
import { ParameterAddress } from '../sweb'

type OptionInputs = {
	fqParamAddress: string
	value: number
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
		actionId: 'setParameterValue',
		name: 'Set Parameter Value',
		options: [
			fQParameterAddressOptionField(),
			{
				id: 'value',
				type: 'textinput',
				label: 'Value',
				default: '0',
				useVariables: true,
			},
			setTypeOptionField(ParameterSetType.ABSOLUTE, [ParameterSetType.ABSOLUTE, ParameterSetType.RELATIVE]),
			unitOptionField(),
		],
		parseOptions: async ({ action, context }) => {
			let paramAddress = await parseParameterAddressFromFQAddress(context, action.options.fqParamAddress)
			let unit = parseEnumInput<typeof ParameterUnit>(action.options.unit, ParameterUnit)
			let setType = parseEnumInput<typeof ParameterSetType>(action.options.setType, ParameterSetType)

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
				value: value,
				setType: setType,
				unit: unit,
			}
		},
		callback: async ({ options }) => {
			let { paramAddress, value, setType, unit } = options

			// // We must subscribe here incase a variable has changed in the object address
			// await moduleCallbacks.subscribe(action, paramAddress, ParameterUnit.RAW)

			// Now set the parameter value
			await moduleCallbacks.setParameterValue(paramAddress, setType, value, unit)
		},
		// subscribe: async ({ action, options }) => {
		// 	let { paramAddress, unit } = options
		// 	await moduleCallbacks.subscribe(action, paramAddress, unit)
		// },
		// unsubscribe: async ({ action }) => {
		// 	await moduleCallbacks.unsubscribe(action)
		// },
	}
}
