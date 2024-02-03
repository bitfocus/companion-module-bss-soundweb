import {
	CompanionActionContext,
	CompanionFeedbackContext,
	CompanionInputFieldCheckbox,
	CompanionInputFieldDropdown,
	CompanionInputFieldTextInput,
	CompanionOptionValues,
	InputValue,
	Regex,
} from '@companion-module/base'
import { ZodError, z } from 'zod'
import { ParameterUnit } from './parameters'
import { ParameterAddress, ParameterAddressParsingError } from './sweb'
import { FQ_OBJ_ADDR_REGEXP, FQ_PARAM_ADDR_REGEXP, VARIABLE_REGEXP, getRegexRange } from './utils'

export enum ParameterSetType {
	ABSOLUTE,
	RELATIVE,
	TOGGLE,
}

export enum ComparisonOptionValues {
	EQUAL,
	GREATER_THAN,
	LESS_THAN,
	GREATER_THAN_EQUAL,
	LESS_THAN_EQUAL,
}

export const nodeOption: CompanionInputFieldTextInput = {
	id: 'node',
	type: 'textinput',
	label: 'Node address',
	default: '0',
	regex: Regex.NUMBER,
	useVariables: true,
}

export const vdOption: CompanionInputFieldTextInput = {
	id: 'vd',
	type: 'textinput',
	label: 'Virtual device',
	default: '3',
	// regex: Regex.NUMBER,
	useVariables: true,
}

export const objOption: CompanionInputFieldTextInput = {
	id: 'object',
	type: 'textinput',
	label: 'Object address',
	default: '0.0.0',
	useVariables: true,
}

export const paramOption: CompanionInputFieldTextInput = {
	id: 'parameter',
	type: 'textinput',
	label: 'Parameter ID',
	default: '0',
	// regex: Regex.NUMBER,
	useVariables: true,
}

// [node].[vd].[obj1].[obj2].[obj3].[param]
// [node].[vd].[obj].[param]
// [fqObj].[param]
export const fullyQualifiedParameterAddressOption: CompanionInputFieldTextInput = {
	id: 'fqParamAddress',
	type: 'textinput',
	label: 'Fully qualified parameter address',
	default: '0.3.0.0.0.0',
	regex: `/${FQ_PARAM_ADDR_REGEXP}/`,
	useVariables: true,
}

export const fullyQualifiedObjectAddressOption: CompanionInputFieldTextInput = {
	id: 'fqObjectAddress',
	type: 'textinput',
	label: 'Fully qualified object address',
	default: '0.3.0.0.0',
	regex: `/${FQ_OBJ_ADDR_REGEXP}/`,
	useVariables: true,
}

export function buttonOption(props?: {
	label?: string
	default?: number
	choices?: { id: number; label: string }[]
	isVisible?: (options: CompanionOptionValues, data: any | undefined) => boolean
	isVisibleData?: any
}): CompanionInputFieldDropdown {
	return {
		id: 'buttonValue',
		type: 'dropdown',
		label: props?.label ?? 'On/off',
		default: props?.default ?? 1,
		choices: props?.choices ?? [
			{ id: 0, label: 'Off' },
			{ id: 1, label: 'On' },
			{ id: 'TOGGLE', label: 'Toggle' },
		],
		allowCustom: false,
		isVisible: props?.isVisible,
	}
}

export function unitOption(
	defaultUnit = ParameterUnit.RAW,
	include: ParameterUnit[] = []
): CompanionInputFieldDropdown {
	let unitLabelMap = new Map([
		[ParameterUnit.RAW, 'Raw'],
		[ParameterUnit.DB, 'dB'],
		[ParameterUnit.PERCENT, '%'],
	])
	let choices =
		include.length > 0
			? [
					...include.map((unit) => {
						return { id: unit, label: unitLabelMap.get(unit) ?? '' }
					}),
			  ]
			: [
					...[...unitLabelMap.entries()].map((entry) => {
						return { id: entry[0], label: entry[1] }
					}),
			  ]
	return {
		id: 'unit',
		type: 'dropdown',
		label: 'Unit',
		default: defaultUnit,
		choices: [...choices],
		allowCustom: false,
	}
}

export function setTypeOption(
	defaultSetType = ParameterSetType.ABSOLUTE,
	include: ParameterSetType[] = []
): CompanionInputFieldDropdown {
	let setTypeLabelMap = new Map([
		[ParameterSetType.ABSOLUTE, 'Absolute'],
		[ParameterSetType.RELATIVE, 'Relative'],
		[ParameterSetType.TOGGLE, 'Toggle'],
	])
	let choices =
		include.length > 0
			? [
					...include.map((setType) => {
						return { id: setType, label: setTypeLabelMap.get(setType) ?? '' }
					}),
			  ]
			: [
					...[...setTypeLabelMap.entries()].map((labelEntry) => {
						return { id: labelEntry[0], label: labelEntry[1] }
					}),
			  ]
	return {
		id: 'setType',
		type: 'dropdown',
		label: 'Absolute/relative adjustment',
		default: defaultSetType,
		choices: [...choices],
		allowCustom: false,
	}
}

export function createVariableOption(): CompanionInputFieldCheckbox {
	return {
		id: 'createVariable',
		type: 'checkbox',
		label: 'Create variable?',
		default: false,
	}
}

export function channelSelectDropdown(
	numCh = 1,
	isVisible?: (options: CompanionOptionValues, data: any | undefined) => boolean
): CompanionInputFieldDropdown {
	return {
		id: 'channel',
		type: 'dropdown',
		label: `Select channel (1-${numCh})`,
		tooltip: `Select channel number (1-${numCh}) or enter variable`,
		default: '1',
		choices: [...Array(numCh).keys()].map((i) => {
			return { id: `${i + 1}`, label: `Ch ${(i + 1).toString()}` }
		}),
		allowCustom: true,
		regex: `/^(${getRegexRange(1, numCh)}|${VARIABLE_REGEXP})$/`,
		isVisible: isVisible,
	}
}

export function comparisonOperationOption(): CompanionInputFieldDropdown {
	return {
		id: 'comparisonOperation',
		type: 'dropdown',
		label: 'Comparison operator',
		default: ComparisonOptionValues.EQUAL,
		choices: [
			{ id: ComparisonOptionValues.EQUAL, label: 'Equal to' },
			{ id: ComparisonOptionValues.GREATER_THAN, label: 'Greater than' },
			{ id: ComparisonOptionValues.LESS_THAN, label: 'Less than' },
			{ id: ComparisonOptionValues.GREATER_THAN_EQUAL, label: 'Greater than or equal to' },
			{ id: ComparisonOptionValues.LESS_THAN_EQUAL, label: 'Less than or equal to' },
		],
	}
}

export type SuccessfulOptionsParsingResult = {
	success: true
	options: { [id: string]: any }
	containsVariable?: boolean
}

export type FailedOptionsParsingResult = {
	success: false
	error: string
}
export type OptionsParsingResult = SuccessfulOptionsParsingResult | FailedOptionsParsingResult

export class ParsingError extends Error {
	constructor(errMsg: string) {
		super(errMsg)
		this.name = 'OptionsParsingError'
	}
}

function getErrorMessage(err: unknown): string {
	let errMsg
	if (err instanceof ZodError) {
		errMsg = err.message
	} else if (typeof err == 'string') {
		errMsg = err
	} else {
		errMsg = 'Unknown parsing error'
	}
	return errMsg
}

export async function parseParameterAddressFromFQAddress(
	context: CompanionActionContext | CompanionFeedbackContext,
	fqAddressString: InputValue | undefined
): Promise<ParameterAddress> {
	try {
		let inputStr = z.coerce.string().parse(fqAddressString)
		let addrString = await context.parseVariablesInString(inputStr)
		return ParameterAddress.fromString(addrString)
	} catch (err) {
		if (err instanceof ParameterAddressParsingError) {
			throw new ParsingError(err.message)
		} else {
			throw new ParsingError(`There was an error parsing the parameter address: ${fqAddressString}`)
		}
	}
}

export async function parseStringInput(
	context: CompanionActionContext | CompanionFeedbackContext,
	input: InputValue | undefined
): Promise<string> {
	if (input == undefined) throw new ParsingError('Input is undefined')
	try {
		let inputStr = z.coerce.string().parse(input)
		let parsedString = await context.parseVariablesInString(inputStr)
		return parsedString
	} catch (err) {
		throw new ParsingError(getErrorMessage(err))
	}
}

export async function parseNumberInput(
	context: CompanionActionContext | CompanionFeedbackContext,
	input: InputValue | undefined,
	withVariables: boolean = true
): Promise<number> {
	if (input == undefined) throw new ParsingError('Input was undefined')

	try {
		let inputStr = z.coerce.string().parse(input)
		let numberStr = withVariables ? await context.parseVariablesInString(inputStr) : inputStr
		let parsedNumber = z.coerce.number().parse(numberStr)
		return parsedNumber
	} catch (err) {
		throw new ParsingError(getErrorMessage(err))
	}
}

export function parseEnumInput(input: InputValue | undefined, enumType: any) {
	if (input == undefined) throw new ParsingError('Input was undefined')
	let enumParser = z.nativeEnum(enumType)
	type enumParser = z.infer<typeof enumType> // Set the type to match what has been supplied
	return enumParser.parse(input)
}

export function parseCheckboxInput(input: InputValue | undefined) {
	try {
		return z.boolean().parse(input)
	} catch (err) {
		throw new ParsingError(getErrorMessage(err))
	}
}

export async function parseDbInput(
	context: CompanionActionContext | CompanionFeedbackContext,
	input: InputValue | undefined,
	withVariables: boolean = true
): Promise<number | string> {
	let inputStr = z.coerce.string().parse(input)
	let numberStr = withVariables ? await context.parseVariablesInString(inputStr) : inputStr
	if (numberStr == '-inf') {
		return '-inf'
	} else {
		return await parseNumberInput(context, input, withVariables)
	}
}

export function parseButtonInput(input: InputValue | undefined, valueOpts: InputValue[] = [0, 1, 'TOGGLE']) {
	try {
		// input = z.coerce.number().parse(input)
		if (input == undefined) return
		if (!valueOpts.includes(input)) throw new ParsingError('Button value is not permitted')
		return input
	} catch (err) {
		throw new ParsingError(getErrorMessage(err))
	}
}
