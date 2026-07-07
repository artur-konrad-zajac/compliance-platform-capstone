export const getInstanceId = (): string => {
  let id = localStorage.getItem('app_instance_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('app_instance_id', id);
  }
  return id;
};
