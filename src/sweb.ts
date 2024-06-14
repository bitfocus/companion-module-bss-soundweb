// Some of the functions within this module are subject to Copyright (c) 2022 Alexandre Matheson
// The aforementioned functions are derived from: https://github.com/dudest/node-red-contrib-soundweb

import { ZodError, z } from 'zod'
import { FQ_PARAM_ADDR_REGEXP } from './utils'

export enum MessageType {
	SET = 0x88,
	SUBSCRIBE = 0x89,
	UNSUBSCRIBE = 0x8a,
	RECALL_PRESET = 0x8c,
	SET_PERCENT = 0x8d,
	SUBSCRIBE_PERCENT = 0x8e,
	UNSUBSCRIBE_PERCENT = 0x8f,
	BUMP_PERCENT = 0x90,
}

export const DI_PORT = 1023
export const MINIMUM_GAIN_RAW_VALUE = -280_617

export function buildSubscribeBuf(paramAddress: ParameterAddress): Buffer {
	let msgType = MessageType.SUBSCRIBE
	let cmdBuf = Buffer.from([msgType])
	let addrBuf = paramAddress.toBuf()
	let dataBuf = Buffer.from([0, 0, 0, 0])

	let buf = encapsulateCommand(Buffer.concat([cmdBuf, addrBuf, dataBuf]))
	return buf
}

export function buildUnsubscribeBuf(paramAddress: ParameterAddress): Buffer {
	let msgType = MessageType.UNSUBSCRIBE
	let cmdBuf = Buffer.from([msgType])
	let addrBuf = paramAddress.toBuf()
	let dataBuf = Buffer.from([0, 0, 0, 0])

	let buf = encapsulateCommand(Buffer.concat([cmdBuf, addrBuf, dataBuf]))
	return buf
}

export function buildSubscribePercentBuf(paramAddress: ParameterAddress): Buffer {
	let msgType = MessageType.SUBSCRIBE_PERCENT
	let cmdBuf = Buffer.from([msgType])
	let addrBuf = paramAddress.toBuf()
	let dataBuf = Buffer.from([0, 0, 0, 0])

	let buf = encapsulateCommand(Buffer.concat([cmdBuf, addrBuf, dataBuf]))
	return buf
}

export function buildUnsubscribePercentBuf(paramAddress: ParameterAddress): Buffer {
	let msgType = MessageType.UNSUBSCRIBE_PERCENT
	let cmdBuf = Buffer.from([msgType])
	let addrBuf = paramAddress.toBuf()
	let dataBuf = Buffer.from([0, 0, 0, 0])

	let buf = encapsulateCommand(Buffer.concat([cmdBuf, addrBuf, dataBuf]))
	return buf
}
/**
 * Build a buffer for setting a parameter value on a device
 */
export function buildSetParameterBuf(
	paramAddress: ParameterAddress,
	value: number,
	msgType: MessageType
	// setUnit: ParameterUnit = ParameterUnit.RAW
) {
	let cmdBuf = Buffer.from([msgType])
	let addrBuf = paramAddress.toBuf()
	let encodedValueBuf: Buffer

	// Encode the value depending on the options provided
	switch (msgType) {
		case MessageType.SET:
			encodedValueBuf = encDiscrete(value)
			break
		case MessageType.BUMP_PERCENT:
		case MessageType.SET_PERCENT:
		default:
			// encodedValueBuf = encPercent(value)
			encodedValueBuf = encDiscrete(value)
			break
	}

	let buf = Buffer.concat([cmdBuf, addrBuf, encodedValueBuf])
	buf = encapsulateCommand(buf)
	return buf
}

function objectAddressToOctets(input: number) {
	let b = Buffer.from([(input >> 16) & 0xff, (input >> 8) & 0xff, input & 0xff])
	return `${b[0]}.${b[1]}.${b[2]}`
}

// 0x03E703000100
function partsFromFqObjectAddr(input: bigint) {
	let node = Number((input >> 32n) & 0xffffn)
	let vd = Number((input >> 24n) & 0xffn)
	let obj = objectAddressToOctets(Number(input & 0xffffffn))
	return {
		node: node,
		vd: vd,
		obj: obj,
	}
}

export class ParameterAddressParsingError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ParameterAddressParsingError'
	}
}

/**
 * Parameter Address object with some helper methods
 */
export class ParameterAddress {
	node: number
	vd: number
	obj: string
	param: number

	constructor(address: { node: number; vd: number; obj: string; param: number }) {
		this.node = address.node
		this.vd = address.vd
		this.obj = address.obj
		this.param = address.param
	}

	toString() {
		// Return a fully qualified string representation of the parameter address
		return `${this.node}.${this.vd}.${this.obj}.${this.param}`
	}

	toBuf() {
		// Returns a buffer representation of the parameter address
		let [a, b, c] = this.obj.split('.')
		let buf = Buffer.alloc(8)

		// Write node & vd
		buf.writeUInt16BE(this.node, 0)
		buf.writeUInt8(this.vd, 2)

		// Write object parts to buf
		buf.writeUint8(parseInt(a), 3)
		buf.writeUInt8(parseInt(b), 4)
		buf.writeUint8(parseInt(c), 5)

		// Write param to buf
		buf.writeUint16BE(this.param, 6)

		return buf
	}

	static fromBuf(buf: Buffer) {
		// Parse object parts
		let a = buf.readUInt8(3)
		let b = buf.readUInt8(4)
		let c = buf.readUInt8(5)

		return new ParameterAddress({
			node: buf.readUint16BE(0),
			vd: buf.readUInt8(2),
			obj: `${a}.${b}.${c}`,
			param: buf.readUint16BE(6),
		})
	}

	static fromString(addrStr: string): ParameterAddress {
		// Parse a Parameter address object from a fully qualified string representation
		function coerceObjectPart(part: string) {
			return z.coerce.number().gte(0).lte(0xff).parse(part)
		}
		try {
			// Check formatting
			addrStr = z.string().regex(new RegExp(FQ_PARAM_ADDR_REGEXP), 'Invalid format').parse(addrStr)

			// Split into parts
			let parts = addrStr.split('.')

			// Switch depending on how many parts we have
			switch (parts.length) {
				case 6: {
					let [node, vd, obj1, obj2, obj3, param] = parts
					return new ParameterAddress({
						node: z.coerce.number().gte(0).lte(0xffff).parse(node),
						vd: z.coerce.number().gte(0).lte(0xff).parse(vd),
						obj: `${coerceObjectPart(obj1)}.${coerceObjectPart(obj2)}.${coerceObjectPart(obj3)}`,
						param: z.coerce.number().gte(0).lte(0xffff).parse(param),
					})
				}
				case 4: {
					let [node, vd, obj, param] = parts
					// let objAsNumVal = z.coerce.number().gte(0).lte(0xfff).parse(obj)
					let objAsNumVal = z.coerce.number().gte(0).parse(obj)

					let objAddrOctets = objectAddressToOctets(objAsNumVal)

					return new ParameterAddress({
						node: z.coerce.number().gte(0).lte(0xffff).parse(node),
						vd: z.coerce.number().gte(0).lte(0xff).parse(vd),
						obj: objAddrOctets,
						param: z.coerce.number().gte(0).lte(0xffff).parse(param),
					})
				}
				case 2: {
					let [fqObj, param] = parts
					let objAsNumVal = z.coerce.bigint().gte(0n).parse(fqObj)
					let { node, vd, obj } = partsFromFqObjectAddr(objAsNumVal)
					return new ParameterAddress({
						node: node,
						vd: vd,
						obj: obj,
						param: z.coerce.number().gte(0).lte(0xffff).parse(param),
					})
				}
				default:
					throw new Error(`Invalid format`)
			}
		} catch (err) {
			if (err instanceof ZodError) {
				throw new ParameterAddressParsingError(`Error parsing address: '${addrStr}': ${err.errors[0].message}`)
			} else if (err instanceof Error) {
				throw new ParameterAddressParsingError(`Error parsing address: '${addrStr}': ${err.message}`)
			} else {
				throw new ParameterAddressParsingError(`Unknown error parsing address: ${addrStr}`)
			}
		}
	}
}

/**
 * Returns a raw value from a dB value (including string '-inf')
 */
export function dbToRaw(dbValue: number | '-inf'): number {
	if (dbValue == '-inf') {
		// dbValue = MINIMUM_GAIN_RAW_VALUE
		dbValue = -80
	}
	dbValue = Math.round(dbValue * 100) / 100
	let value
	if (dbValue >= -10) {
		value = dbValue * 10000
	} else {
		value = -Math.log10(Math.abs(dbValue / 10)) * 200000 - 100000
	}
	return value
}

/**
 * Returns a dB value from a raw value
 */
export function rawToDb(rawValue: number): number {
	// if (rawValue == MINIMUM_GAIN_RAW_VALUE) return '-inf'
	let value
	if (rawValue >= -100000) {
		value = rawValue / 10000
	} else {
		value = -10 * Math.pow(10, Math.abs(rawValue + 100000) / 200000)
	}
	return Math.round(value * 100) / 100 // Round off to ensure rounding errors don't accumulate after repetitive relative changes
}

/**
 * Returns a raw value of a percentage (0-100) of a 4 byte range
 */
export function percentToRaw(percent: number): number {
	// Clamp 0-100%
	percent = percent > 100 ? 100 : percent
	percent = percent < 0 ? 0 : percent
	return (Math.round(percent * 100) / 100) * 65536
}

/**
 * Returns a percentage representation (0-100) of a value within a 4 byte range
 */
export function rawToPercent(rawValue: number): number {
	return Math.round((rawValue / 65536) * 100) / 100
}

/**
 * Returns a byte subsitituted buffer, removing illegal bytes.
 * @param {Buffer} buf - Buffer to be transformed
 * @returns {Buffer} Transformed Buffer
 */
export function byteSubstitute(buf: Buffer): Buffer {
	let temp = []
	for (let i = 0; i < buf.length; i++) {
		switch (buf[i]) {
			case 0x02:
				temp.push(0x1b)
				temp.push(0x82)
				break
			case 0x03:
				temp.push(0x1b)
				temp.push(0x83)
				break
			case 0x06:
				temp.push(0x1b)
				temp.push(0x86)
				break
			case 0x15:
				temp.push(0x1b)
				temp.push(0x95)
				break
			case 0x1b:
				temp.push(0x1b)
				temp.push(0x9b)
				break
			default:
				temp.push(buf[i])
				break
		}
	}
	return Buffer.from(temp)
}

/**
 * Returns a Buffer in its original form.
 * @param {Buffer} buf - Buffer with illegal bytes subsituted
 * @returns {Buffer} Buffer in original form
 */
export function byteUnsubstitute(buf: Buffer): Buffer {
	let temp = []
	for (let i = 0; i < buf.length; i++) {
		if (buf[i] == 0x1b) {
			i++
			switch (buf[i]) {
				case 0x82:
					temp.push(0x02)
					break
				case 0x83:
					temp.push(0x03)
					break
				case 0x86:
					temp.push(0x06)
					break
				case 0x95:
					temp.push(0x15)
					break
				case 0x9b:
					temp.push(0x1b)
					break
			}
		} else {
			temp.push(buf[i])
		}
	}
	return Buffer.from(temp)
}

/**
 * Returns checksum.
 * @param {Buffer} buf - Buffer to be used for calculation
 * @returns {Buffer} Checksum (as a Buffer)
 */
export function calculateChecksum(buf: Buffer): Buffer {
	let chk = 0
	for (let i = 0; i < buf.length; i++) {
		// @ts-ignore
		chk = chk ^ parseInt(buf[i])
	}
	return Buffer.from([chk])
}

/**
 * Returns an encapsulated command ready to be transmitted to Soundweb device.
 * The following operations are rolled up into this function:
 * - Generate checksum.
 * - Build command string with checksum.
 * - Byte substitute illegal characters.
 * - build command string with STX and ETX bytes.
 * @param {Buffer} buf - Command as a Buffer to be encapsulated
 * @returns {Buffer} Encapsulated command as a Buffer
 */
export function encapsulateCommand(buf: Buffer): Buffer {
	let checksum = calculateChecksum(buf)
	let temp = Buffer.concat([buf, checksum])
	temp = byteSubstitute(temp)
	return Buffer.concat([Buffer.from([2]), temp, Buffer.from([3])])
}

/**
 * Returns a decapsulated command.
 * The following operations are rolled up into this function:
 * - Strip off STX and ETX.
 * - Unsubstitute illegal characters.
 * - Remove command portion
 * - Remove checksum portion.
 * - Calculate the checksum.
 * - Compare checksum in the command and the calculated checksum.
 *   - If checksums match, return command to caller.
 *   - If checksums don't match, return null to caller.
 * @param {Buffer} buf - Encapsulated command as a buffer
 * @returns {Buffer} Decapsulated command
 */
export function decapsulateCommand(buf: Buffer): Buffer | null {
	let temp = buf.subarray(1, buf.length - 1)
	temp = byteUnsubstitute(temp)
	let tempCommand = temp.subarray(0, temp.length - 1)
	let tempChecksum1 = temp.subarray(-1)
	let tempChecksum2 = calculateChecksum(tempCommand)
	if (Buffer.compare(tempChecksum1, tempChecksum2) == 0) {
		return tempCommand
	} else {
		return null
	}
}

/**
 * Returns the message type (buffer) from a full decapsualted command Buffer.
 * @param {Buffer} buf - Decapsulated command
 * @returns {Buffer} Command ID (1 byte Buffer)
 */
export function getMessageTypeBuffer(buf: Buffer): Buffer {
	return buf.subarray(0, 1)
}

/**
 * Returns address portion of a decapsulated command Buffer.
 * @param {Buffer} buf - Decapsulated command
 * @returns {Buffer} Address (8 byte Buffer)
 */
export function getAddressBuffer(buf: Buffer): Buffer {
	return buf.subarray(1, 9)
}

/**
 * Returns data portion of a decapsulated command buffer.
 * @param {Buffer} buf - Decapsulated command
 * @returns {Buffer} Data (4 byte Buffer)
 */
export function getDataBuffer(buf: Buffer): Buffer {
	return buf.subarray(9)
}

/**
 * Returns a 4 byte buffer representation of an number.
 * @param {number} int - Data as an integer
 * @returns {Buffer} integer as a 4 byte Buffer
 */
export function encDiscrete(int: number): Buffer {
	return Buffer.from([(int >> 24) & 0xff, (int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff])
}

/**
 * Converts a 4 byte Buffer into a number.
 * @param {Buffer} buf - Data as a 4 byte Buffer
 * @returns {number} Data as a number
 */
export function decDiscrete(buf: Buffer): number {
	return (buf[0] << 24) + (buf[1] << 16) + (buf[2] << 8) + buf[3]
}

/**
 * Returns a 4 byte data Buffer representation of a percentage value
 * @param {number} value - Percentage value
 * @returns {Buffer} Data as a Buffer
 */
export function encPercent(value: number): Buffer {
	return encDiscrete(value * 65536)
}

/**
 * Returns a number between 0 and 100
 * @param {Buffer} buf - 4 byte Buffer representation of a percentage value
 * @returns {number} Number between 0 and 100
 */
export function decPercent(buf: Buffer): number {
	return decDiscrete(buf) / 65536
}

/**
 * Returns a 4 byte Buffer representation of a dB value
 * @param {number} dbValue - dB value
 * @returns {Buffer} 4 byte Buffer representation of a dB value
 */
export function encGain(dbValue: number): Buffer {
	let value

	if (dbValue >= -10) {
		value = dbValue * 10000
	} else {
		value = -Math.log10(Math.abs(dbValue / 10)) * 200000 - 100000
	}

	return encDiscrete(value)
}

/**
 * Returns a dB value
 * @param {Buffer} buf - 4 byte Buffer representation of a dB value
 * @returns {number} dB value
 */
export function decGain(buf: Buffer): number {
	let value = decDiscrete(buf)
	if (value >= -100000) {
		return value / 10000
	} else {
		return -10 * Math.pow(10, Math.abs(value + 100000) / 200000)
	}
}

/**
 * Retruns a 4 byte Buffer of a scalar linear scaled number
 * @param {number} val - number
 * @returns {Buffer} 4 byte Buffer representation of a number
 */
export function encScalarLinear(val: number): Buffer {
	return encDiscrete(val * 10000)
}

/**
 * Returns a scalar linear scaled number
 * @param {Buffer} buf - 4 byte Buffer representation of a number
 * @returns {number} number
 */
export function decScalarLinear(buf: Buffer): number {
	return decDiscrete(buf) / 10000
}

/**
 * Returns a 4 byte Buffer representation of a ms value
 * @param {number} val - ms delay
 * @returns {Buffer} - 4 byte Buffer representation of a ms number
 */
export function encDelay(val: number): Buffer {
	return encDiscrete((val * 96000) / 1000)
}

/**
 * Returns a ms value
 * @param {Buffer} buf - 4 byte Buffer representation of a ms number
 * @returns {number} ms value
 */
export function decDelay(buf: Buffer): number {
	return (decDiscrete(buf) * 1000) / 96000
}

/**
 * Returns a 4 byte Buffer representation of a Frequency or Speed scaled value
 * @param {number} val - Hz or ms value
 * @returns {Buffer} 4 byte Buffer representation of a Hz or ms value
 */
export function encFrequencyOrSpeed(val: number): Buffer {
	return encDiscrete(Math.log10(val) * 1000000)
}

/**
 * Returns a Frequency or Speed value
 * @param {Buffer} buf - 4 byte Buffer representation of a Hz or ms value
 * @returns {number} Hz or ms value
 */
export function decFrequencyOrSpeed(buf: Buffer): number {
	return Math.pow(10, decDiscrete(buf) / 1000000)
}
