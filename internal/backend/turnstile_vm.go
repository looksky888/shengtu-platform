package backend

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"strconv"
	"strings"
	"time"
)

type turnstileOrderedMap struct {
	keys   []string
	values map[string]any
}

func newTurnstileOrderedMap() *turnstileOrderedMap {
	return &turnstileOrderedMap{
		keys:   make([]string, 0, 8),
		values: make(map[string]any, 8),
	}
}

func (m *turnstileOrderedMap) add(key string, value any) {
	if _, exists := m.values[key]; !exists {
		m.keys = append(m.keys, key)
	}
	m.values[key] = value
}

func (m *turnstileOrderedMap) MarshalJSON() ([]byte, error) {
	if m == nil {
		return []byte("null"), nil
	}
	return json.Marshal(m.values)
}

type turnstileFunc func(args ...any) any

var turnstileSpecialStrings = map[string]string{
	"window.Math":            "[object Math]",
	"window.Reflect":         "[object Reflect]",
	"window.performance":     "[object Performance]",
	"window.localStorage":    "[object Storage]",
	"window.Object":          "function Object() { [native code] }",
	"window.Reflect.set":     "function set() { [native code] }",
	"window.performance.now": "function () { [native code] }",
	"window.Object.create":   "function create() { [native code] }",
	"window.Object.keys":     "function keys() { [native code] }",
	"window.Math.random":     "function random() { [native code] }",
}

func turnstileToStr(value any) string {
	if value == nil {
		return "undefined"
	}
	switch v := value.(type) {
	case string:
		if mapped, ok := turnstileSpecialStrings[v]; ok {
			return mapped
		}
		return v
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case bool:
		if v {
			return "true"
		}
		return "false"
	case []string:
		return strings.Join(v, ",")
	case []any:
		allStrings := true
		parts := make([]string, len(v))
		for i, item := range v {
			if s, ok := item.(string); ok {
				parts[i] = s
			} else {
				allStrings = false
				parts[i] = turnstileToStr(item)
			}
		}
		if allStrings {
			return strings.Join(parts, ",")
		}
		return fmt.Sprint(v)
	default:
		return fmt.Sprint(v)
	}
}

func turnstileXORString(text, key string) string {
	if key == "" {
		return text
	}
	textRunes := []rune(text)
	keyRunes := []rune(key)
	if len(keyRunes) == 0 {
		return text
	}
	out := make([]rune, len(textRunes))
	for i, ch := range textRunes {
		out[i] = ch ^ keyRunes[i%len(keyRunes)]
	}
	return string(out)
}

func turnstileNormKey(key any) any {
	switch k := key.(type) {
	case int:
		return float64(k)
	case int64:
		return float64(k)
	case float64:
		return k
	case string:
		return k
	default:
		return fmt.Sprint(k)
	}
}

func turnstileToFloat(value any) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
		return f, err == nil
	default:
		return 0, false
	}
}

func turnstileDecodeBase64String(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if rem := len(trimmed) % 4; rem != 0 {
		trimmed += strings.Repeat("=", 4-rem)
	}
	decoded, err := base64.StdEncoding.DecodeString(trimmed)
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(strings.TrimRight(trimmed, "="))
		if err != nil {
			return "", err
		}
	}
	return string(decoded), nil
}

// solveTurnstileToken executes the ChatGPT Sentinel Turnstile dx bytecode in-process.
// Ported from yukkcat/chatgpt2api utils/turnstile.py.
func solveTurnstileToken(dx, p string) (string, error) {
	if strings.TrimSpace(dx) == "" || strings.TrimSpace(p) == "" {
		return "", fmt.Errorf("missing turnstile dx or p token")
	}
	decoded, err := turnstileDecodeBase64String(dx)
	if err != nil {
		return "", fmt.Errorf("decode turnstile dx: %w", err)
	}
	xored := turnstileXORString(decoded, p)
	var tokenList []any
	if err := json.Unmarshal([]byte(xored), &tokenList); err != nil {
		return "", fmt.Errorf("parse turnstile bytecode: %w", err)
	}

	processMap := make(map[any]any, 64)
	startTime := time.Now()
	result := ""

	getValue := func(key any) any {
		return processMap[turnstileNormKey(key)]
	}
	setValue := func(key, value any) {
		processMap[turnstileNormKey(key)] = value
	}

	jsAbs := func(value any) float64 {
		if f, ok := turnstileToFloat(value); ok {
			return math.Abs(f)
		}
		return 0.0
	}

	jsProp := func(obj, key any) any {
		switch container := obj.(type) {
		case *turnstileOrderedMap:
			if container == nil {
				return nil
			}
			return container.values[turnstileToStr(key)]
		case map[any]any:
			if val, ok := container[turnstileNormKey(key)]; ok {
				return val
			}
			return container[turnstileToStr(key)]
		case map[string]any:
			return container[turnstileToStr(key)]
		case []any:
			if f, ok := turnstileToFloat(key); ok {
				idx := int(f)
				if idx >= 0 && idx < len(container) {
					return container[idx]
				}
			}
			return nil
		case []string:
			if f, ok := turnstileToFloat(key); ok {
				idx := int(f)
				if idx >= 0 && idx < len(container) {
					return container[idx]
				}
			}
			return nil
		case string:
			keyText := turnstileToStr(key)
			if keyText == "location" && container == "window.document" {
				return "https://chatgpt.com/"
			}
			if keyText != "" && keyText != "undefined" && keyText != "None" && keyText != "<nil>" {
				return container + "." + keyText
			}
		}
		return nil
	}

	callTarget := func(target any, args []any) any {
		if targetStr, ok := target.(string); ok {
			switch targetStr {
			case "window.performance.now":
				elapsedNs := float64(time.Since(startTime).Nanoseconds())
				return (elapsedNs + rand.Float64()) / 1e6
			case "window.Object.create":
				return newTurnstileOrderedMap()
			case "window.Object.keys":
				if len(args) > 0 {
					if s, ok := args[0].(string); ok && s == "window.localStorage" {
						return []any{
							"STATSIG_LOCAL_STORAGE_INTERNAL_STORE_V4",
							"STATSIG_LOCAL_STORAGE_STABLE_ID",
							"client-correlated-secret",
							"oai/apps/capExpiresAt",
							"oai-did",
							"STATSIG_LOCAL_STORAGE_LOGGING_REQUEST",
							"UiState.isNavigationCollapsed.1",
						}
					}
					if om, ok := args[0].(*turnstileOrderedMap); ok && om != nil {
						out := make([]any, len(om.keys))
						for i, k := range om.keys {
							out[i] = k
						}
						return out
					}
					if m, ok := args[0].(map[string]any); ok {
						out := make([]any, 0, len(m))
						for k := range m {
							out = append(out, k)
						}
						return out
					}
					if m, ok := args[0].(map[any]any); ok {
						out := make([]any, 0, len(m))
						for k := range m {
							out = append(out, k)
						}
						return out
					}
				}
				return nil
			case "window.Math.random":
				return rand.Float64()
			case "window.Reflect.set":
				if len(args) >= 3 {
					obj, keyName, val := args[0], args[1], args[2]
					switch m := obj.(type) {
					case *turnstileOrderedMap:
						if m != nil {
							m.add(turnstileToStr(keyName), val)
							return true
						}
					case map[string]any:
						m[turnstileToStr(keyName)] = val
						return true
					case map[any]any:
						m[turnstileToStr(keyName)] = val
						return true
					}
				}
				return false
			}
			return nil
		}
		if fn, ok := target.(turnstileFunc); ok && fn != nil {
			return fn(args...)
		}
		return nil
	}

	const (
		maxTurnstileVMDepth      = 64
		maxTurnstileVMTotalSteps = 100000
	)
	var (
		vmDepth    int
		totalSteps int
		vmErr      error
	)
	var runQueue func(limit int) error
	runQueue = func(limit int) error {
		if vmErr != nil {
			return vmErr
		}
		if vmDepth >= maxTurnstileVMDepth {
			vmErr = fmt.Errorf("turnstile_vm_recursion_limit")
			return vmErr
		}
		vmDepth++
		defer func() {
			vmDepth--
		}()
		if limit <= 0 {
			limit = 20000
		}
		steps := 0
		for {
			if vmErr != nil {
				return vmErr
			}
			queue, ok := getValue(9).([]any)
			if !ok || len(queue) == 0 {
				break
			}
			steps++
			totalSteps++
			if steps > limit || totalSteps > maxTurnstileVMTotalSteps {
				vmErr = fmt.Errorf("turnstile_vm_step_limit")
				return vmErr
			}
			token := queue[0]
			setValue(9, queue[1:])
			instr, ok := token.([]any)
			if !ok || len(instr) == 0 {
				continue
			}
			fn, ok := getValue(instr[0]).(turnstileFunc)
			if !ok || fn == nil {
				continue
			}
			func() {
				defer func() {
					if r := recover(); r != nil && vmErr == nil {
						vmErr = fmt.Errorf("turnstile_vm_panic: %v", r)
					}
				}()
				fn(instr[1:]...)
			}()
		}
		return vmErr
	}

	cloneSlice := func(items any) []any {
		src, ok := items.([]any)
		if !ok || len(src) == 0 {
			return []any{}
		}
		dst := make([]any, len(src))
		copy(dst, src)
		return dst
	}

	// Opcode 1: XOR string in reg[e] with reg[t]
	setValue(1, turnstileFunc(func(args ...any) any {
		if len(args) < 2 {
			return nil
		}
		e, t := args[0], args[1]
		setValue(e, turnstileXORString(turnstileToStr(getValue(e)), turnstileToStr(getValue(t))))
		return nil
	}))

	// Opcode 2: Set literal value
	setValue(2, turnstileFunc(func(args ...any) any {
		if len(args) < 2 {
			return nil
		}
		setValue(args[0], args[1])
		return nil
	}))

	// Opcode 3: Store base64-encoded result
	setValue(3, turnstileFunc(func(args ...any) any {
		if len(args) < 1 {
			return nil
		}
		val := args[0]
		if _, isStr := val.(string); !isStr {
			if regVal := getValue(val); regVal != nil {
				val = regVal
			}
		}
		result = base64.StdEncoding.EncodeToString([]byte(turnstileToStr(val)))
		return nil
	}))

	// Opcode 5: Append to slice or concatenate strings
	setValue(5, turnstileFunc(func(args ...any) any {
		if len(args) < 2 {
			return nil
		}
		e, t := args[0], args[1]
		current := getValue(e)
		incoming := getValue(t)
		if list, ok := current.([]any); ok {
			next := make([]any, len(list)+1)
			copy(next, list)
			next[len(list)] = incoming
			setValue(e, next)
			return nil
		}
		_, curIsStr := current.(string)
		_, curIsFloat := turnstileToFloat(current)
		_, incIsStr := incoming.(string)
		_, incIsFloat := turnstileToFloat(incoming)
		if curIsStr || curIsFloat || incIsStr || incIsFloat {
			setValue(e, turnstileToStr(current)+turnstileToStr(incoming))
			return nil
		}
		setValue(e, "NaN")
		return nil
	}))

	// Opcode 6: Property access
	setValue(6, turnstileFunc(func(args ...any) any {
		if len(args) < 3 {
			return nil
		}
		setValue(args[0], jsProp(getValue(args[1]), getValue(args[2])))
		return nil
	}))

	// Opcode 7: Call target with dereferenced register args (discard return value)
	setValue(7, turnstileFunc(func(args ...any) any {
		if len(args) < 1 {
			return nil
		}
		callArgs := make([]any, len(args)-1)
		for i, arg := range args[1:] {
			callArgs[i] = getValue(arg)
		}
		callTarget(getValue(args[0]), callArgs)
		return nil
	}))

	// Opcode 8: Copy register
	setValue(8, turnstileFunc(func(args ...any) any {
		if len(args) < 2 {
			return nil
		}
		setValue(args[0], getValue(args[1]))
		return nil
	}))

	// Register 9: Instruction queue
	setValue(9, tokenList)
	// Register 10: "window"
	setValue(10, "window")
	// Opcode 11: Set register to nil
	setValue(11, turnstileFunc(func(args ...any) any {
		if len(args) >= 1 {
			setValue(args[0], nil)
		}
		return nil
	}))
	// Opcode 12: Store processMap reference in register
	setValue(12, turnstileFunc(func(args ...any) any {
		if len(args) >= 1 {
			setValue(args[0], processMap)
		}
		return nil
	}))

	// Opcode 13: Try call target with raw args, store error message on failure
	setValue(13, turnstileFunc(func(args ...any) any {
		if len(args) < 2 {
			return nil
		}
		e, t := args[0], args[1]
		defer func() {
			if r := recover(); r != nil {
				setValue(e, fmt.Sprint(r))
			}
		}()
		callTarget(getValue(t), args[2:])
		return nil
	}))

	// Opcode 14: JSON parse
	setValue(14, turnstileFunc(func(args ...any) any {
		if len(args) < 2 {
			return nil
		}
		raw := turnstileToStr(getValue(args[1]))
		var parsed any
		if err := json.Unmarshal([]byte(raw), &parsed); err == nil {
			setValue(args[0], parsed)
		}
		return nil
	}))

	// Opcode 15: JSON stringify
	setValue(15, turnstileFunc(func(args ...any) any {
		if len(args) < 2 {
			return nil
		}
		encoded, err := json.Marshal(getValue(args[1]))
		if err == nil {
			setValue(args[0], string(encoded))
		}
		return nil
	}))

	// Register 16: p token
	setValue(16, p)

	// Opcode 17: Call target with dereferenced register args and store return value
	setValue(17, turnstileFunc(func(args ...any) any {
		if len(args) < 2 {
			return nil
		}
		callArgs := make([]any, len(args)-2)
		for i, arg := range args[2:] {
			callArgs[i] = getValue(arg)
		}
		setValue(args[0], callTarget(getValue(args[1]), callArgs))
		return nil
	}))

	// Opcode 18: Base64 decode register in-place
	setValue(18, turnstileFunc(func(args ...any) any {
		if len(args) < 1 {
			return nil
		}
		if dec, err := turnstileDecodeBase64String(turnstileToStr(getValue(args[0]))); err == nil {
			setValue(args[0], dec)
		}
		return nil
	}))

	// Opcode 19: Base64 encode register in-place
	setValue(19, turnstileFunc(func(args ...any) any {
		if len(args) < 1 {
			return nil
		}
		setValue(args[0], base64.StdEncoding.EncodeToString([]byte(turnstileToStr(getValue(args[0])))))
		return nil
	}))

	// Opcode 20: Conditional call if reg[e] == reg[t]
	setValue(20, turnstileFunc(func(args ...any) any {
		if len(args) < 3 {
			return nil
		}
		if turnstileValuesEqual(getValue(args[0]), getValue(args[1])) {
			if fn, ok := getValue(args[2]).(turnstileFunc); ok && fn != nil {
				fn(args[3:]...)
			}
		}
		return nil
	}))

	// Opcode 21: Conditional call if abs(float(reg[e]) - float(reg[t])) > abs(float(reg[n]))
	setValue(21, turnstileFunc(func(args ...any) any {
		if len(args) < 4 {
			return nil
		}
		ef, ok1 := turnstileToFloat(getValue(args[0]))
		tf, ok2 := turnstileToFloat(getValue(args[1]))
		var delta float64
		if ok1 && ok2 {
			delta = ef - tf
		}
		if math.Abs(delta) > jsAbs(getValue(args[2])) {
			if fn, ok := getValue(args[3]).(turnstileFunc); ok && fn != nil {
				fn(args[4:]...)
			}
		}
		return nil
	}))

	// Opcode 22: Run sub-queue and set reg[e] = "None"
	setValue(22, turnstileFunc(func(args ...any) any {
		if len(args) < 2 {
			return nil
		}
		previous := cloneSlice(getValue(9))
		setValue(9, cloneSlice(args[1]))
		err := runQueue(20000)
		setValue(9, previous)
		if err != nil {
			return nil
		}
		setValue(args[0], "None")
		return nil
	}))

	// Opcode 23: Call reg[t] if reg[e] is not nil
	setValue(23, turnstileFunc(func(args ...any) any {
		if len(args) < 2 {
			return nil
		}
		if getValue(args[0]) != nil {
			if fn, ok := getValue(args[1]).(turnstileFunc); ok && fn != nil {
				fn(args[2:]...)
			}
		}
		return nil
	}))

	// Opcode 24: Same as Opcode 6 (jsProp)
	setValue(24, turnstileFunc(func(args ...any) any {
		if len(args) < 3 {
			return nil
		}
		setValue(args[0], jsProp(getValue(args[1]), getValue(args[2])))
		return nil
	}))

	noop := turnstileFunc(func(args ...any) any { return nil })
	setValue(25, noop)
	setValue(26, noop)

	// Opcode 27: Remove element from list or subtract numbers
	setValue(27, turnstileFunc(func(args ...any) any {
		if len(args) < 2 {
			return nil
		}
		e, t := args[0], args[1]
		current := getValue(e)
		incoming := getValue(t)
		if list, ok := current.([]any); ok {
			for idx, item := range list {
				if turnstileValuesEqual(item, incoming) {
					next := make([]any, 0, len(list)-1)
					next = append(next, list[:idx]...)
					next = append(next, list[idx+1:]...)
					setValue(e, next)
					break
				}
			}
			return nil
		}
		cf, ok1 := turnstileToFloat(current)
		inf, ok2 := turnstileToFloat(incoming)
		if ok1 && ok2 {
			setValue(e, cf-inf)
		} else {
			setValue(e, float64(0))
		}
		return nil
	}))

	setValue(28, noop)

	// Opcode 29: Less-than comparison
	setValue(29, turnstileFunc(func(args ...any) any {
		if len(args) < 3 {
			return nil
		}
		tf, ok1 := turnstileToFloat(getValue(args[1]))
		nf, ok2 := turnstileToFloat(getValue(args[2]))
		if ok1 && ok2 {
			setValue(args[0], tf < nf)
			return nil
		}
		setValue(args[0], turnstileToStr(getValue(args[1])) < turnstileToStr(getValue(args[2])))
		return nil
	}))

	// Opcode 30: Define subroutine closure
	setValue(30, turnstileFunc(func(args ...any) any {
		if len(args) < 3 {
			return nil
		}
		e := args[0]
		n := args[2]
		var r any
		if len(args) >= 4 {
			r = args[3]
		}
		rList, isArray := r.([]any)
		var captureKeys []any
		var subQueue []any
		if isArray {
			captureKeys, _ = n.([]any)
			subQueue = cloneSlice(rList)
		} else {
			subQueue = cloneSlice(n)
		}
		subroutine := turnstileFunc(func(callArgs ...any) any {
			previous := cloneSlice(getValue(9))
			if isArray {
				for idx, key := range captureKeys {
					if idx < len(callArgs) {
						setValue(key, callArgs[idx])
					}
				}
			}
			setValue(9, cloneSlice(subQueue))
			err := runQueue(20000)
			setValue(9, previous)
			_ = err
			return nil
		})
		setValue(e, subroutine)
		return nil
	}))

	// Opcode 33: Multiply numbers
	setValue(33, turnstileFunc(func(args ...any) any {
		if len(args) < 3 {
			return nil
		}
		tf, ok1 := turnstileToFloat(getValue(args[1]))
		nf, ok2 := turnstileToFloat(getValue(args[2]))
		if ok1 && ok2 {
			setValue(args[0], tf*nf)
		} else {
			setValue(args[0], float64(0))
		}
		return nil
	}))

	// Opcode 34: Copy register
	setValue(34, turnstileFunc(func(args ...any) any {
		if len(args) < 2 {
			return nil
		}
		setValue(args[0], getValue(args[1]))
		return nil
	}))

	if err := runQueue(20000); err != nil {
		return "", err
	}
	if strings.TrimSpace(result) == "" {
		return "", fmt.Errorf("turnstile bytecode completed without emitting token")
	}
	return result, nil
}

func turnstileValuesEqual(a, b any) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	if af, ok1 := turnstileToFloat(a); ok1 {
		if bf, ok2 := turnstileToFloat(b); ok2 {
			return af == bf
		}
	}
	return turnstileToStr(a) == turnstileToStr(b)
}
