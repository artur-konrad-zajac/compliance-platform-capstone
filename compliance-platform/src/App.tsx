import { Layout } from './components/Layout'
import { ApplicantForm } from './components/ApplicantForm'
import { ReviewValidationPanel } from './components/ReviewValidationPanel'
import { FormBuilder } from './components/FormBuilder'
import { useAppContext } from './context/AppContext'

function App() {
  const { role } = useAppContext();

  return (
    <Layout>
      {role === 'customer' && <ApplicantForm />}
      {role === 'validator' && <ReviewValidationPanel />}
      {role === 'builder' && <FormBuilder />}
    </Layout>
  )
}

export default App
