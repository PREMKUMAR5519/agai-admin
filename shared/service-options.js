export const serviceCategories = [
  { value: 'sports', label: 'Sports & performance' },
  { value: 'rehabilitation', label: 'Rehabilitation' },
  { value: 'wellness', label: "Women's wellness" },
  { value: 'ageing', label: 'Healthy ageing' },
]
export const serviceIcons = [
  { value: 'activity', label: 'Activity' }, { value: 'strength', label: 'Strength' },
  { value: 'joint', label: 'Joint' }, { value: 'brain', label: 'Brain' },
  { value: 'leaf', label: 'Leaf' }, { value: 'flower', label: 'Flower' }, { value: 'person', label: 'Person' },
]
export const maxServices = 50
export const serviceFields = [
  { key: 'title', label: 'Service title', max: 150 },
  { key: 'shortTitle', label: 'Short title', max: 100 },
  { key: 'intro', label: 'Short introduction', max: 400, rows: 3 },
  { key: 'description', label: 'Description', max: 1500, rows: 4 },
  { key: 'forYou', label: 'Who is this for?', max: 1000, rows: 3 },
]
