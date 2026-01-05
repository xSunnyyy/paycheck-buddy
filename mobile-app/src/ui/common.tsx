import React, { useRef } from "react";
import { Platform, Pressable, Text, TextInput, View, StyleSheet, StyleProp, ViewStyle, TextStyle } from "react-native";

export const COLORS = {
  bg: "#070A10",
  text: "rgba(244,245,247,0.95)",
  textStrong: "rgba(255,255,255,0.98)",
  muted: "rgba(185,193,204,0.82)",
  faint: "rgba(185,193,204,0.58)",
  border: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.09)",
  glassB: "rgba(255,255,255,0.045)",
  greenSoft: "rgba(34,197,94,0.16)",
  redBorder: "rgba(248,113,113,0.55)",
  amberSoft: "rgba(251,191,36,0.15)",
};

export const TYPE = {
  h1: { fontSize: 18, fontWeight: "900" as const },
  h2: { fontSize: 14, fontWeight: "900" as const },
  label: { fontSize: 12, fontWeight: "800" as const },
  body: { fontSize: 13, fontWeight: "600" as const },
};

// 1. Memoized Card
export const Card = React.memo(function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.cardContainer}>
      <View style={styles.cardContent}>
        {children}
      </View>
    </View>
  );
});

// 2. Memoized Divider
export const Divider = React.memo(function Divider() {
  return <View style={styles.divider} />;
});

// 3. Memoized Chip
export const Chip = React.memo(function Chip({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{children}</Text>
    </View>
  );
});

// 4. Text Button (dynamic styles based on 'kind')
export function TextBtn({
  label,
  onPress,
  kind = "default",
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: "default" | "green" | "red";
  disabled?: boolean;
}) {
  const getStyle = () => {
    if (kind === "green") return styles.btnGreen;
    if (kind === "red") return styles.btnRed;
    return styles.btnDefault;
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.btnBase, getStyle(), disabled && styles.disabled]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

// 5. Input Field
export function Field({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  placeholder,
  onFocusScrollToInput,
  borderColorOverride,
  clearOnFocus = false,
  multiline = false,
  numberOfLines,
  autoCapitalize = "none",
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  keyboardType?: "default" | "numeric";
  placeholder?: string;
  onFocusScrollToInput?: (inputRef: React.RefObject<TextInput>) => void;
  borderColorOverride?: string;
  clearOnFocus?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  const inputRef = useRef<TextInput>(null);

  const nativeKeyboardType: any =
    keyboardType === "numeric" && Platform.OS === "ios" ? "decimal-pad" : keyboardType;

  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        keyboardType={nativeKeyboardType}
        placeholder={placeholder}
        placeholderTextColor="rgba(185,193,204,0.45)"
        onFocus={() => {
          if (clearOnFocus) onChangeText("");
          // src/ui/common.tsx line ~122
if (onFocusScrollToInput) {
  // Cast to 'any' to fix the strict null check error
  onFocusScrollToInput(inputRef as any);
}
        }}
        autoCorrect={false}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        numberOfLines={numberOfLines}
        style={[
          styles.input,
          borderColorOverride ? { borderColor: borderColorOverride } : null,
          multiline && styles.inputMultiline
        ]}
      />
    </View>
  );
}

// --- StyleSheet ---

const styles = StyleSheet.create({
  // Card
  cardContainer: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  cardContent: {
    padding: 14,
    backgroundColor: COLORS.glassB,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
    marginVertical: 10,
  },

  // Chip
  chip: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  chipText: {
    color: COLORS.text,
    fontWeight: "800",
  },

  // Buttons
  btnBase: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  btnText: {
    color: COLORS.text,
    fontWeight: "900",
  },
  btnDefault: {
    borderColor: COLORS.border,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  btnGreen: {
    borderColor: "rgba(34,197,94,0.30)",
    backgroundColor: "rgba(34,197,94,0.18)",
  },
  btnRed: {
    borderColor: "rgba(248,113,113,0.30)",
    backgroundColor: "rgba(248,113,113,0.16)",
  },
  disabled: {
    opacity: 0.45,
  },

  // Field
  fieldContainer: {
    marginTop: 10,
  },
  fieldLabel: {
    color: COLORS.muted,
    ...TYPE.label,
  },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    paddingHorizontal: 12,
    color: COLORS.textStrong,
    backgroundColor: "rgba(255,255,255,0.05)",
    fontWeight: "800",
  },
  inputMultiline: {
    minHeight: 44,
    textAlignVertical: "top",
  },
});