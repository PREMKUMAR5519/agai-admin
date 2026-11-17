import { z } from 'zod'
import { documentSections, validateDocument } from '../../shared/rich-text.js'
import { maxServices, serviceCategories, serviceIcons } from '../../shared/service-options.js'

const text = max => z.string().trim().min(1).max(max)
const optional = max => z.string().trim().max(max)
const webUrl = z.string().trim().max(2000).refine(value => !value || /^https?:\/\/[^\s]+$/i.test(value), 'Use an http:// or https:// URL')
const imageUrl = z.string().trim().max(2000).refine(value => !value || /^https?:\/\/[^\s]+$/i.test(value) || /^\/(?:images|uploads)\/[\w./-]+$/.test(value), 'Choose an image or enter an HTTP image URL')
export const articleSchema = z.object({
  title: text(180), slug: text(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens'),
  category: text(80), excerpt: text(400), image: imageUrl.transform(value => value || '/images/blog/default-covver-pic.jpg'), imageAlt: optional(200),
  sections: z.array(z.object({ heading: text(180), text: text(15000) })).max(40).default([]),
  body: z.unknown().transform((value, ctx) => {
    try { return validateDocument(value) }
    catch (error) { ctx.addIssue({ code: 'custom', message: error.message }); return z.NEVER }
  }).optional(),
}).refine(article => article.body || article.sections.length, 'Write some blog content before saving')
  .transform(article => article.body ? { ...article, sections: documentSections(article.body) } : article)
const serviceSchema = z.object({
  id: text(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens').refine(id => id !== 'not-sure', 'This service ID is reserved'),
  category: z.enum(serviceCategories.map(item => item.value)),
  icon: z.enum(serviceIcons.map(item => item.value)),
  image: imageUrl.refine(Boolean, 'Choose a service image'), previewImage: imageUrl.refine(Boolean, 'Choose a preview image'), title: text(150), shortTitle: text(100), intro: text(400), description: text(1500), forYou: text(1000), focus: z.array(text(300)).min(1).max(8),
})
export const servicesSchema = z.array(serviceSchema).min(1).max(maxServices).refine(items => new Set(items.map(item => item.id)).size === items.length, 'Each service must have a unique ID')
export const contentSchema = z.object({
  clinic: z.object({
    name: text(120), founder: text(120), phone: optional(40).refine(value => !value || /^\+?[\d\s().-]{7,40}$/.test(value), 'Enter a valid phone number'),
    whatsapp: optional(20).refine(value => !value || /^\d{7,15}$/.test(value), 'Use 7–15 digits including country code'),
    email: z.union([z.literal(''), z.email()]), address: optional(500), mapsUrl: webUrl, mapsEmbedUrl: webUrl.refine(value => !value || /^https:\/\/(?:maps\.google\.com|www\.google\.com)\//.test(value), 'Use a Google Maps embed URL'), hours: optional(500),
  }),
  // Keep single-part titles readable if they were saved by the former hero editor.
  home: z.object({ headline: z.array(text(90)).min(1).max(3), speciality: text(150), featureTitle: text(150), featureText: text(500), heroImage: imageUrl.refine(Boolean, 'Choose a homepage image') }),
  founder: z.object({ role: text(120), credentials: text(150), description: text(1500) }),
  services: servicesSchema,
  faqs: z.array(z.object({ question: text(250), answer: text(2000) })).min(1).max(30),
  approach: z.array(z.object({ title: text(180), text: text(1500) })).length(3),
})
export const loginSchema = z.object({ email: z.email().max(200).transform(value => value.toLowerCase()), password: z.string().min(1).max(256), turnstileToken: z.string().max(2048).optional() })
export const passwordSchema = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(128) })
export const deleteServiceSchema = z.object({ revision: z.number().int().min(0), password: z.string().min(1).max(256) })
export const deleteMediaSchema = z.object({ password: z.string().min(1).max(256) })
export const editSchema = schema => z.object({ revision: z.number().int().min(0), data: schema })
