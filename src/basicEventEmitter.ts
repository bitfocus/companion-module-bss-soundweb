import { EventEmitter } from 'events'

type EventMap = Record<string, any>
type EventKey<T extends EventMap> = string & keyof T
type EventReceiver<T> = (params: T) => void
interface Emitter<T extends EventMap> extends EventEmitter {
	on<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>): this
	off<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>): this
	emit<K extends EventKey<T>>(eventName: K, params?: T[K]): boolean
	once<K extends EventKey<T>>(eventName: K, fn: EventReceiver<T[K]>): this

	// TODO... make this static method typed

	// static once(
	// 	emitter: _NodeEventTarget,
	// 	eventName: string | symbol,
	// 	options?: StaticEventEmitterOptions,
	// ): Promise<any[]>;
}

export function createBasicEventEmitter<T extends EventMap>(): Emitter<T> {
	return new EventEmitter()
}
