import AsyncStorage from "@react-native-async-storage/async-storage";

export const STORAGE_KEY = "paycheck_buddy_v1";

export async function loadStorage<T>(): Promise<T | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function saveStorage<T>(data: T): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function wipeStorage(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
