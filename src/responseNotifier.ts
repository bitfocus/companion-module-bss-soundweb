import { EventEmitter, once } from 'events'
import { TimeoutError, promiseWithTimeout } from './utils'

export type ResponseNotification<DataType> = {
	data: DataType
	error: null | Error
}

export class ResponseNotifier<DataType> {
	#emitter: EventEmitter = new EventEmitter()
	options: {
		timeout: number
		maxListeners: number
	}

	constructor(options = { timeout: 1000, maxListeners: 500 }) {
		this.options = options
		this.#emitter.setMaxListeners(this.options.maxListeners) // Helps in debugging to check for leaks
	}

	async response(requestId: string): Promise<ResponseNotification<DataType | null>> {
		try {
			// this.#emitter.eventNames().forEach((element) => {
			// 	console.log(element, this.#emitter.listenerCount(element))
			// })

			let data = await promiseWithTimeout(once(this.#emitter, requestId), this.options.timeout) // Wait here for a response (or timeout)

			return {
				data: data,
				error: null,
			}
		} catch (err) {
			// Catch a timeout error, and any other error for that matter and return it in the result object
			this.#emitter.removeAllListeners(requestId)
			if (err instanceof TimeoutError) {
				return {
					data: null,
					error: new Error(`There was no response to request: ${requestId} within ${this.options.timeout / 1000}s`),
				}
			} else if (err instanceof Error) {
				return {
					data: null,
					error: new Error(`An error occured whilst waiting for a response from request: ${requestId}: ${err.message}`),
				}
			} else {
				return {
					data: null,
					error: new Error(`An unknown error occured whilst waiting for a response from request: ${requestId}`),
				}
			}
		}
	}

	setResponse(requestId: string, data: DataType) {
		this.#emitter.emit(requestId, data)
	}

	destroy() {
		this.#emitter.removeAllListeners()
	}
}
