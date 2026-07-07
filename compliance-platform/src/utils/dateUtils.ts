export const formatDateYMD = (date: Date) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const time = date.toLocaleTimeString([], { hour12: false });
  return `${yyyy}-${mm}-${dd}, ${time}`;
};
