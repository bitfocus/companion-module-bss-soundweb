import {
	CompanionActionContext,
	CompanionFeedbackContext,
	CompanionInputFieldCheckbox,
	CompanionInputFieldDropdown,
	CompanionInputFieldTextInput,
	CompanionOptionValues,
	InputValue,
} from '@companion-module/base'
import { EnumLike, ZodError, z } from 'zod'
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

// [node].[vd].[obj1].[obj2].[obj3].[param]
// [node].[vd].[obj].[param]
// [fqObj].[param]
export type FQParameterAddressOptionField = CompanionInputFieldTextInput & {
	id: 'fqParamAddress'
}

export function fQParameterAddressOptionField(): FQParameterAddressOptionField {
	return {
		id: 'fqParamAddress',
		type: 'textinput',
		label: 'Fully qualified parameter address',
		tooltip:
			"Provide the fully qualified (complete) address of the 'parameter' within your design that you wish to interact with.  This must be in one of the documented/compatible formats.  See this module's 'help' page for more information.",
		default: '0.3.0.0.0.0',
		regex: `/${FQ_PARAM_ADDR_REGEXP}/`,
		useVariables: true,
	}
}

export type FQObjectAddressOptionField = CompanionInputFieldTextInput & {
	id: 'fqObjectAddress'
}

export function fQObjectAddressOptionField(): FQObjectAddressOptionField {
	return {
		id: 'fqObjectAddress',
		type: 'textinput',
		label: 'Fully qualified object address',
		tooltip:
			"Provide the fully qualified (complete) address of the 'object' within your design that you wish to interact with.  This must be in one of the documented/compatible formats.  See this module's 'help' page for more information.",
		default: '0.3.0.0.0',
		regex: `/${FQ_OBJ_ADDR_REGEXP}/`,
		useVariables: true,
	}
}

export type ButtonValueSelectionOptionField = CompanionInputFieldDropdown & {
	id: 'buttonValue'
}

export type ButtonValueChoice = { id: number; label: string }

export function buttonValueSelectionOptionField(props?: {
	label?: string
	default?: number
	choices?: ButtonValueChoice[]
	isVisible?: (options: CompanionOptionValues, data: any | undefined) => boolean
	isVisibleData?: any
}): ButtonValueSelectionOptionField {
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

export type UnitOptionField = CompanionInputFieldDropdown & {
	id: 'unit'
}

export function unitOptionField(defaultUnit = ParameterUnit.RAW, include: ParameterUnit[] = []): UnitOptionField {
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

export type SetTypeOptionField = CompanionInputFieldDropdown & {
	id: 'setType'
}

export function setTypeOptionField(
	defaultSetType = ParameterSetType.ABSOLUTE,
	include: ParameterSetType[] = []
): SetTypeOptionField {
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

export type CreateVariableOptionField = CompanionInputFieldCheckbox & {
	id: 'createVariable'
}

export function createVariableOptionField(): CreateVariableOptionField {
	return {
		id: 'createVariable',
		type: 'checkbox',
		label: 'Create variable?',
		default: false,
	}
}

export type ChannelInputField = CompanionInputFieldDropdown & {
	id: 'channel'
}

export function channelSelectDropdown(
	numCh = 1,
	isVisible?: (options: CompanionOptionValues, data: any | undefined) => boolean
): ChannelInputField {
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

export type ComparisonOperatorField = CompanionInputFieldDropdown & {
	id: 'comparisonOperator'
}

export function comparisonOperatorOption(): ComparisonOperatorField {
	return {
		id: 'comparisonOperator',
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

export type ParsedOptionValues = {
	[key: string]: any
}

export type SuccessfulOptionsParsingResult<OptionValues extends ParsedOptionValues> = {
	success: true
	options: OptionValues
	containsVariable?: boolean
}

export type FailedOptionsParsingResult = {
	success: false
	error: string
}
export type OptionsParsingResult<OptionValues extends ParsedOptionValues> =
	| SuccessfulOptionsParsingResult<OptionValues>
	| FailedOptionsParsingResult

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

export function parseEnumInput<T extends EnumLike>(input: InputValue | undefined, enumType: T): T[keyof T] {
	if (input == undefined) throw new ParsingError('Input was undefined')
	let enumParser = z.nativeEnum<T>(enumType)
	// type enumParser = z.infer<typeof enumType> // Set the type to match what has been supplied
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
): Promise<number> {
	let inputStr = z.coerce.string().parse(input)
	let numberStr = withVariables ? await context.parseVariablesInString(inputStr) : inputStr
	if (numberStr == '-inf') {
		// return '-inf'
		return -80
	} else {
		return await parseNumberInput(context, input, withVariables)
	}
}

export type DefaultButtonValues = 0 | 1 | 'TOGGLE'

export type ValuesOf<T extends any[]> = T[number]
export type UnionOfArrayElements<ARR_T extends Readonly<unknown[]>> = ARR_T[number]

export function validateButtonInput<T extends any[]>(
	input: UnionOfArrayElements<T> | undefined,
	valueOpts: T = [0, 1, 'TOGGLE'] as T
): UnionOfArrayElements<T> {
	try {
		// input = z.coerce.number().parse(input)
		if (input == undefined) throw new ParsingError('Button value is undefined')
		if (!valueOpts.includes(input)) throw new ParsingError('Button value is not provided as a value option')
		return input
	} catch (err) {
		throw new ParsingError(getErrorMessage(err))
	}
}
