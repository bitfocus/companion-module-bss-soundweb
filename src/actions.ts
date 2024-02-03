import {
	CompanionActionContext,
	CompanionActionDefinitions,
	CompanionActionEvent,
	CompanionActionInfo,
} from '@companion-module/base'
import { SoundwebModuleInstance } from './main'
import {
	FailedOptionsParsingResult,
	OptionsParsingResult,
	ParameterSetType,
	ParsingError,
	buttonOption,
	channelSelectDropdown,
	fullyQualifiedObjectAddressOption,
	fullyQualifiedParameterAddressOption,
	parseButtonInput,
	parseDbInput,
	parseEnumInput,
	parseNumberInput,
	parseParameterAddressFromFQAddress,
	setTypeOption,
	unitOption,
} from './options'
import { ParameterUnit } from './parameters'
import { getRegexRange } from './utils'

function handleActionOptionsParsingError(err: any, action: CompanionActionInfo): FailedOptionsParsingResult {
	if (err instanceof ParsingError) {
		return {
			success: false,
			error: `Error parsing options for action "${action.actionId}" @ ${action.controlId} (${action.id}): ${err.message}`,
		}
	} else {
		return {
			success: false,
			error: `Unknown error while parsing options for action "${action.actionId}" @ ${action.controlId} (${action.id})`,
		}
	}
}

async function parseOptionsForSetParameterAction(
	action: CompanionActionInfo,
	context: CompanionActionContext
): Promise<OptionsParsingResult> {
	let paramAddress
	let value
	let setType
	let unit
	try {
		paramAddress = await parseParameterAddressFromFQAddress(context, action.options.fqParamAddress)
		value = await parseNumberInput(context, action.options.value)
		setType = parseEnumInput(action.options.setType, ParameterSetType)
		unit = parseEnumInput(action.options.unit, ParameterUnit)
	} catch (err) {
		return handleActionOptionsParsingError(err, action)
	}
	return {
		success: true,
		options: {
			paramAddress: paramAddress,
			value: value,
			setType: setType,
			unit: unit,
		},
	}
}

async function parseOptionsForButtonAction(
	action: CompanionActionInfo,
	context: CompanionActionContext
): Promise<OptionsParsingResult> {
	let paramAddress
	let buttonValue
	try {
		paramAddress = await parseParameterAddressFromFQAddress(context, action.options.fqParamAddress)
		buttonValue = parseButtonInput(action.options.buttonValue)
	} catch (err) {
		return handleActionOptionsParsingError(err, action)
	}
	return {
		success: true,
		options: {
			paramAddress: paramAddress,
			buttonValue: buttonValue,
		},
	}
}

async function parseOptionsForGainNInputGainAction(
	action: CompanionActionInfo,
	context: CompanionActionContext
): Promise<OptionsParsingResult> {
	let paramAddress
	let channelParam
	let setType
	let unit
	let value
	try {
		channelParam = (await parseNumberInput(context, action.options.channel)) - 1
		paramAddress = await parseParameterAddressFromFQAddress(
			context,
			`${action.options.fqObjectAddress}.${channelParam}`
		)
		setType = parseEnumInput(action.options.setType, ParameterSetType)
		unit = parseEnumInput(action.options.unit, ParameterUnit)

		switch (unit) {
			case ParameterUnit.DB:
				value = await parseDbInput(context, action.options.value)
				break
			default:
				value = await parseNumberInput(context, action.options.value)
		}
	} catch (err) {
		return handleActionOptionsParsingError(err, action)
	}
	return {
		success: true,
		options: {
			paramAddress: paramAddress,
			setType: setType,
			unit: unit,
			value: value,
		},
	}
}

async function parseOptionsForGainNInputMuteAction(
	action: CompanionActionInfo,
	context: CompanionActionContext
): Promise<OptionsParsingResult> {
	try {
		let channelParam = (await parseNumberInput(context, action.options.channel)) - 1
		channelParam = channelParam + 32
		let paramAddress = await parseParameterAddressFromFQAddress(
			context,
			`${action.options.fqObjectAddress}.${channelParam}`
		)
		let buttonValue = parseButtonInput(action.options.buttonValue)
		return {
			success: true,
			options: {
				paramAddress: paramAddress,
				buttonValue: buttonValue,
			},
		}
	} catch (err) {
		return handleActionOptionsParsingError(err, action)
	}
}

export default function (module: SoundwebModuleInstance): CompanionActionDefinitions {
	return {
		setParameter: {
			name: 'Set parameter',
			options: [
				fullyQualifiedParameterAddressOption,
				{
					id: 'value',
					type: 'textinput',
					label: 'Value',
					default: '0',
					useVariables: true,
				},
				setTypeOption(ParameterSetType.ABSOLUTE, [ParameterSetType.ABSOLUTE, ParameterSetType.RELATIVE]),
				unitOption(),
			],
			callback: async (action: CompanionActionEvent, context: CompanionActionContext) => {
				let parsed = await parseOptionsForSetParameterAction(action, context)
				if (parsed.success == false) return module.log('error', parsed.error)

				// If options are successfully parsed...
				let { paramAddress, value, setType, unit } = parsed.options
				module.log('debug', `Action for parameter: ${paramAddress.toString()} has been trigered.`)
				await module.deviceSetParameterValue(paramAddress, setType, value, unit)
			},

			subscribe: async (action: CompanionActionInfo, context: CompanionActionContext) => {
				let parsed = await parseOptionsForSetParameterAction(action, context)
				if (parsed.success == false) return module.log('error', parsed.error)

				let { paramAddress, unit } = parsed.options
				await module.subscribeAction(action, paramAddress, unit)
			},

			unsubscribe: async (action: CompanionActionInfo, context: CompanionActionContext) => {
				let parsed = await parseOptionsForSetParameterAction(action, context)
				if (parsed.success == false) return module.log('error', parsed.error)
				await module.unsubscribeAction(action)
			},
		},
		button: {
			name: 'Custom Button',
			options: [fullyQualifiedParameterAddressOption, buttonOption()],
			callback: async (action: CompanionActionEvent, context: CompanionActionContext) => {
				let parsed = await parseOptionsForButtonAction(action, context)
				if (parsed.success == false) return module.log('error', parsed.error)

				let { paramAddress, buttonValue } = parsed.options
				module.log('debug', `Action for parameter: ${paramAddress.toString()} has been trigered.`)

				// We must subscribe here incase a variable has changed in the parameter address
				await module.subscribeAction(action, paramAddress, ParameterUnit.RAW)

				if (buttonValue == 'TOGGLE') {
					await module.deviceSetToggle(paramAddress, ParameterUnit.RAW)
				} else {
					await module.deviceSetParameterValue(paramAddress, ParameterSetType.ABSOLUTE, buttonValue)
				}
			},

			subscribe: async (action: CompanionActionInfo, context: CompanionActionContext) => {
				let parsed = await parseOptionsForButtonAction(action, context)
				if (parsed.success == false) return module.log('error', parsed.error)

				let { paramAddress } = parsed.options
				await module.subscribeAction(action, paramAddress, ParameterUnit.RAW)
			},

			unsubscribe: async (action: CompanionActionInfo, context: CompanionActionContext) => {
				let parsed = await parseOptionsForButtonAction(action, context)
				if (parsed.success == false) return module.log('error', parsed.error)
				await module.unsubscribeAction(action)
			},
		},
		gain_n_input_gain: {
			name: 'Gain N-Input: Gain',
			options: [
				fullyQualifiedObjectAddressOption,
				channelSelectDropdown(32),
				{
					id: 'value',
					type: 'textinput',
					label: 'Level',
					default: '0',
					useVariables: true,
					regex: `/^(${getRegexRange(-80, 100)}(\\.${getRegexRange(0, 99)})?|-inf)$/`,
				},
				unitOption(ParameterUnit.DB, [ParameterUnit.DB, ParameterUnit.PERCENT]),
				setTypeOption(),
				// {
				// 	id: 'limit',
				// 	type: 'checkbox',
				// 	label: 'Limit?',
				// 	default: false,
				// 	// isVisible: (options) => options.setType == ParameterSetType.RELATIVE
				// },
				// {
				// 	id: 'limitMax',
				// 	type: 'textinput',
				// 	label: 'Max',
				// 	default: '10',
				// 	useVariables: true,
				// 	isVisible: (options) => options.limit == true,
				// },
				// {
				// 	id: 'limitMin',
				// 	type: 'textinput',
				// 	label: 'Min',
				// 	default: '-inf',
				// 	useVariables: true,
				// 	isVisible: (options) => options.limit == true,
				// },
			],
			callback: async (action: CompanionActionEvent, context: CompanionActionContext) => {
				let parsed = await parseOptionsForGainNInputGainAction(action, context)
				if (parsed.success == false) return module.log('error', parsed.error)

				let { paramAddress, setType, value, unit } = parsed.options
				module.log('debug', `Action for parameter: ${paramAddress.toString()} has been trigered.`)

				// We must subscribe here incase a variable has changed in the object address
				await module.subscribeAction(action, paramAddress, ParameterUnit.DB)

				await module.deviceSetParameterValue(paramAddress, setType, value, unit)
			},

			subscribe: async (action: CompanionActionInfo, context: CompanionActionContext) => {
				let parsed = await parseOptionsForGainNInputGainAction(action, context)
				if (parsed.success == false) return module.log('error', parsed.error)

				let { paramAddress } = parsed.options
				await module.subscribeAction(action, paramAddress, ParameterUnit.RAW)
			},

			unsubscribe: async (action: CompanionActionInfo, context: CompanionActionContext) => {
				let parsed = await parseOptionsForGainNInputGainAction(action, context)
				if (parsed.success == false) return module.log('error', parsed.error)
				await module.unsubscribeAction(action)
			},
		},
		gain_n_input_mute: {
			name: 'Gain N-Input: Mute',
			options: [
				fullyQualifiedObjectAddressOption,
				channelSelectDropdown(32),
				buttonOption({
					label: 'Mute on/off',
				}),
			],
			callback: async (action: CompanionActionEvent, context: CompanionActionContext) => {
				let parsed = await parseOptionsForGainNInputMuteAction(action, context)
				if (parsed.success == false) return module.log('error', parsed.error)

				let { paramAddress, buttonValue } = parsed.options
				module.log('debug', `Action for parameter: ${paramAddress.toString()} has been trigered.`)

				// We must subscribe here incase a variable has changed in the object address
				await module.subscribeAction(action, paramAddress, ParameterUnit.RAW)

				if (buttonValue == 'TOGGLE') {
					await module.deviceSetToggle(paramAddress, ParameterUnit.RAW)
				} else {
					await module.deviceSetParameterValue(paramAddress, ParameterSetType.ABSOLUTE, buttonValue)
				}
			},

			subscribe: async (action: CompanionActionInfo, context: CompanionActionContext) => {
				let parsed = await parseOptionsForGainNInputMuteAction(action, context)
				if (parsed.success == false) return module.log('error', parsed.error)
				let { paramAddress } = parsed.options
				await module.subscribeAction(action, paramAddress, ParameterUnit.RAW)
			},

			unsubscribe: async (action: CompanionActionInfo, context: CompanionActionContext) => {
				let parsed = await parseOptionsForGainNInputMuteAction(action, context)
				if (parsed.success == false) return module.log('error', parsed.error)
				await module.unsubscribeAction(action)
			},
		},
	}
}
