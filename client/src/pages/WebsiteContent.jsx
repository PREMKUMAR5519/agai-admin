import { Loading, Notice } from '../components'
import { ServicesProvider, useServices } from '../ServicesContext'
import ServiceContentForm from '../ServiceContentForm'

export default function WebsiteContent() {
  return <ServicesProvider><ServicesEditor/></ServicesProvider>
}
function ServicesEditor() {
  const { data, error, reload } = useServices()
  if (error) return <><Notice error>{error}</Notice><button className="button secondary" onClick={reload}>Retry loading services</button></>
  if (!data) return <Loading/>
  return <ServiceContentForm initial={data}/>
}
