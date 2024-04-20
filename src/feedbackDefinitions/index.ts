import { useFeedbackDefinition } from '../feedbacks'
import compareParameterValue from './_compareParameterValue'
import genericButtonValue from './_genericButtonValue'
import gainNInputGain from './_gainNInputGain'
import gainNInputMute from './_gainNInputMute'
import addParameterVariable from './_addParameterVariable'

// Export all of the feedbacks we want to expose to our module here.
// Each feedback definition must be wrapped using 'useFeedbackDefinition' to permit existential types(!)
export default [
	useFeedbackDefinition(compareParameterValue),
	useFeedbackDefinition(genericButtonValue),
	useFeedbackDefinition(gainNInputGain),
	useFeedbackDefinition(gainNInputMute),
	useFeedbackDefinition(addParameterVariable),
]
