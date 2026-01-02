import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "payflow.setupComplete";

export async function getSetupComplete(): Promise<boolean> {
  const value = await AsyncStorage.getItem(KEY);
  return value === "true";
}

export async function setSetupComplete(value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, value ? "true" : "false");
}