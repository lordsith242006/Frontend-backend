export const categoryOptions = [
  { value: 'all', label: 'Все' },
  { value: 'GPU', label: 'Видеокарта' },
  { value: 'CPU', label: 'Процессор' },
  { value: 'SSD', label: 'SSD' },
  { value: 'RAM', label: 'Оперативная память' },
  { value: 'Case', label: 'Корпус' },
  { value: 'PSU', label: 'Блок питания' }
];

export const roleOptions = [
  { value: 'user', label: 'Пользователь' },
  { value: 'moderator', label: 'Модератор' },
  { value: 'admin', label: 'Администратор' }
];

const categoryLabelMap = Object.fromEntries(categoryOptions.map((item) => [item.value, item.label]));

const roleLabelMap = {
  admin: 'Администратор',
  moderator: 'Модератор',
  user: 'Пользователь'
};

export function getCategoryLabel(category) {
  return categoryLabelMap[category] || category;
}

export function getRoleLabel(role) {
  return roleLabelMap[role] || role;
}
