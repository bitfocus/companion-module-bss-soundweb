import { useActionDefinition } from '../actions'
import genericButton from './_genericButton'
import gainNInputGain from './_gainNInputGain'
import gainNInputMute from './_gainNInputMute'
import setParameter from './_setParameter'

// Export all of the actions we want to expose to our module here.
// Each action definition must be wrapped using 'useActionDefinition' to permit existential types(!)
export default [
	useActionDefinition(setParameter),
	useActionDefinition(genericButton),
	useActionDefinition(gainNInputGain),
	useActionDefinition(gainNInputMute),
]
