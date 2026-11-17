import { createContext, useContext, useCallback } from 'react'
import { api } from './api'
import { useResource } from './components'

const ServicesContext = createContext(null)
export function ServicesProvider({ children }) {
  const resource = useResource('/services')
  const saveServices = useCallback(async (services, revision) => {
    const result = await api('/services', { method: 'PUT', body: { revision, data: services } })
    resource.setData(result)
    return result
  }, [resource.setData])
  const publishServices = useCallback(async revision => {
    const result = await api('/services/publish', { method: 'POST', body: { revision } })
    resource.setData(result)
    return result
  }, [resource.setData])
  const deleteService = useCallback(async (id, revision, password) => {
    const result = await api(`/services/${encodeURIComponent(id)}`, { method: 'DELETE', body: { revision, password } })
    resource.setData(result)
    return result
  }, [resource.setData])
  return <ServicesContext.Provider value={{ ...resource, saveServices, publishServices, deleteService }}>{children}</ServicesContext.Provider>
}
export function useServices() {
  const context = useContext(ServicesContext)
  if (!context) throw new Error('useServices requires ServicesProvider')
  return context
}
