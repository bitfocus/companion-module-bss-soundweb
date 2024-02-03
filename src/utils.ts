import toRegexRange = require('to-regex-range')
import { EnumLike } from 'zod'

export const VARIABLE_REGEXP = '\\$\\(.+\\)'

const OCTET_PART_REGEXP = `\\d+|${VARIABLE_REGEXP}`
const HEX_VALUE_REGEXP = '0x[a-zA-Z0-9]+'
const DECIMAL_VALUE_REGEXP = `\\d+`

export const NODE_REGEXP = `${DECIMAL_VALUE_REGEXP}|${HEX_VALUE_REGEXP}|${VARIABLE_REGEXP}`
export const VD_REGEXP = `${DECIMAL_VALUE_REGEXP}|${HEX_VALUE_REGEXP}|${VARIABLE_REGEXP}`
export const OBJ_REGEXP = `((${OCTET_PART_REGEXP})\\.(${OCTET_PART_REGEXP})\\.(${OCTET_PART_REGEXP}))|${HEX_VALUE_REGEXP}|${DECIMAL_VALUE_REGEXP}|${VARIABLE_REGEXP}`
export const PARAM_REGEXP = `${DECIMAL_VALUE_REGEXP}|${HEX_VALUE_REGEXP}|${VARIABLE_REGEXP}`
export const FQ_PARAM_ADDR_REGEXP = `^(((${NODE_REGEXP})\\.(${VD_REGEXP})\\.(${OBJ_REGEXP}))|${HEX_VALUE_REGEXP})\\.(${PARAM_REGEXP})$`
export const FQ_OBJ_ADDR_REGEXP = `^((${NODE_REGEXP})\\.(${VD_REGEXP})\\.(${OBJ_REGEXP}))|${HEX_VALUE_REGEXP}$`


export class TimeoutError extends Error {
	constructor(errMsg: string) {
		super(errMsg)
		this.name = 'TimeoutError'
	}
}

/**
 * Returns a Promise which will be rejected after specified timeout.
 */
export function promiseWithTimeout(prom: Promise<any>, time: number) {
	let timer: NodeJS.Timeout
	return Promise.race([
		prom,
		new Promise(
			(_r, rej) => (timer = setTimeout(() => rej(new TimeoutError(`Response not within ${time / 1000}s`)), time))
		),
	]).finally(() => clearTimeout(timer))
}

export function getRegexRange(start: number, end: number, options?: { capture: boolean }) {
	return toRegexRange(start, end, options)
}

export function enumToObject(enumType: EnumLike) {
	// return Object.values(enumType)
	let obj: { [id: string]: string | number } = {}
	Object.keys(enumType).forEach((e) => {
		obj[e] = enumType[e]
	})
	return obj
}