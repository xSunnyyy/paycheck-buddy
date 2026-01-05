// src/hooks/useKeyboardHeight.ts
import { useEffect, useState } from "react";
import { Keyboard, KeyboardEvent, Platform } from "react-native";

export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // iOS supports "WillShow" for smoother animations.
    // Android usually only supports "DidShow".
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent) => setHeight(e.endCoordinates.height);
    const onHide = () => setHeight(0);

    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  return height;
}