# Testing Wompi Webhook Integration

## Cambios Implementados

### 1. Corrección de Header de Firma ✅
**Archivo**: `/src/routes/wompi.ts`

**Cambio**: El header de validación ahora usa `X-Event-Checksum` en lugar de `x-integrity-signature`.

```typescript
// Antes
const receivedSignature = c.req.header('x-integrity-signature')

// Ahora
const receivedSignature = c.req.header('X-Event-Checksum') || c.req.header('x-event-checksum')
```

**Logs Mejorados**: Ahora muestra información detallada del webhook:
- Event type
- Transaction ID
- Reference (ORDER-XX)
- Status
- Signature presente

### 2. Debug de Validación de Firma ✅
**Archivo**: `/src/services/wompi.service.ts`

**Mejoras**:
- Muestra valores extraídos de las propiedades
- Muestra el string concatenado
- Muestra el hash calculado vs esperado
- Incluye primeros caracteres del secret para verificar configuración

**Ejemplo de log cuando falla**:
```
🔍 Detalles de validación: {
  properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
  extractedValues: {
    'transaction.id': '11984559-1761111547-48917',
    'transaction.status': 'APPROVED',
    'transaction.amount_in_cents': 10400000
  },
  concatenatedValues: '10400000APPROVED11984559-1761111547-48917',
  secretLength: 48,
  dataToHash: '10400000APPROVED11984559-1761111547-48917[SECRET:test_integ...]',
  expected: '0ef4b22037fb806aa5e76baef98c12dc04164e04a531b1faa2da1ff92c00d533',
  calculated: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
}
```

### 3. Protección de Cuentas Eliminadas ✅
**Archivo**: `/src/services/user.service.ts`

**Métodos Protegidos**:

#### `loginWithEmail()`
- Verifica `is_deleted` al obtener el perfil
- Lanza error: `"This account has been deleted and cannot be accessed"`
- Previene MFA y sesión si la cuenta está eliminada

#### `signupWithEmail()`
- Verifica si el email está asociado a una cuenta eliminada
- Lanza error: `"This email is associated with a deleted account and cannot be reused"`
- Previene re-registro con emails de cuentas eliminadas

#### `refreshSession()`
- Verifica `is_deleted` antes de refrescar tokens
- Lanza error: `"This account has been deleted and cannot be accessed"`
- Previene renovación de sesión para cuentas eliminadas

#### `getUserByAccessToken()`
- Verifica `is_deleted` al obtener usuario (usado en OAuth callback)
- Retorna error: `"This account has been deleted and cannot be accessed"`
- Previene acceso OAuth a cuentas eliminadas

---

## Cómo Probar el Webhook

### Paso 1: Verificar que el Backend está Corriendo
```bash
cd /home/amador/gh/leetcoding
npm run dev
# o
npm start
```

El backend debe estar en: `http://localhost:3010`

### Paso 2: Exponer el Webhook con ngrok (Desarrollo)
```bash
# Instalar ngrok si no lo tienes
# https://ngrok.com/download

# Exponer el puerto 3010
ngrok http 3010
```

Esto te dará una URL pública como:
```
https://abc123.ngrok.io
```

### Paso 3: Configurar el Webhook en Wompi
1. Ir a: https://comercios.wompi.co/
2. Login con tu cuenta de sandbox
3. Ir a **Configuración → Webhooks**
4. Agregar endpoint: `https://abc123.ngrok.io/wompi/webhook`
5. Seleccionar eventos:
   - `transaction.updated` (OBLIGATORIO)
   - `transaction.created` (opcional)

### Paso 4: Hacer un Pago de Prueba

#### Opción A: Desde el Frontend
```bash
cd /home/amador/gh/codeforces
npm run dev
# Frontend en http://localhost:3000
```

1. Agregar productos al carrito
2. Ir a `/checkout`
3. Usar datos de prueba PSE:
   - **Banco**: Cualquiera
   - **Tipo de persona**: Natural
   - **Tipo de documento**: CC
   - **Número de documento**: 123456789
   - **Email**: test@example.com

#### Opción B: Trigger Manual desde Wompi
1. Ir a tu transacción en el panel de Wompi
2. Buscar "Enviar Webhook de Prueba"
3. Enviar evento `transaction.updated` con status `APPROVED`

### Paso 5: Verificar los Logs

**En el backend** (`localhost:3010`), deberías ver:

```
📬 Webhook de Wompi recibido: {
  event: 'transaction.updated',
  timestamp: '2024-01-XX...',
  transactionId: '11984559-1761111547-48917',
  reference: 'ORDER-44',
  status: 'APPROVED',
  hasSignature: true,
  signature: '0ef4b22037fb806aa5e76baef98c12dc04164e04a531b1faa2da1ff92c00d533'
}
```

**Si la firma es válida**:
```
✅ Firma de webhook validada correctamente
✅ Webhook procesado - Orden ORDER-44 actualizada a APPROVED
```

**Si la firma es inválida**:
```
⚠️ Firma de webhook inválida
🔍 Detalles de validación: {
  properties: [...],
  extractedValues: {...},
  concatenatedValues: '...',
  expected: '0ef4b22...',
  calculated: 'xxxxxx...'
}
```

### Paso 6: Verificar en la Base de Datos

```sql
-- Verificar que la orden se actualizó
SELECT id, status, payment_id, updated_at 
FROM orders 
WHERE id = 44;

-- Debería mostrar:
-- status: 'completed' (si APPROVED)
-- payment_id: '11984559-1761111547-48917'
-- updated_at: timestamp reciente
```

---

## Troubleshooting

### Problema: "Invalid signature"

**Causa Posible 1**: El secret está mal configurado

**Solución**:
```bash
# Verificar .env
cat .env | grep WOMPI_EVENTS_SECRET

# Debe ser:
WOMPI_EVENTS_SECRET=test_integrity_da6xTSFwIjmkBcbaEajluAEHar7jvewT
```

**Causa Posible 2**: Las propiedades están en orden incorrecto

**Verificar en los logs**:
```
concatenatedValues: '10400000APPROVED11984559-1761111547-48917'
```

Debería ser (en orden alfabético de propiedades):
1. `transaction.amount_in_cents` → `10400000`
2. `transaction.id` → `11984559-1761111547-48917`
3. `transaction.status` → `APPROVED`

Concatenado: `10400000` + `11984559-1761111547-48917` + `APPROVED`

**Causa Posible 3**: El event body no tiene la estructura esperada

**Verificar**:
```typescript
{
  event: 'transaction.updated',
  data: {
    transaction: {
      id: '...',
      status: 'APPROVED',
      amount_in_cents: 10400000
    }
  },
  signature: {
    checksum: '...',
    properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents']
  }
}
```

### Problema: Orden no se actualiza

**Causa**: El reference no tiene el formato correcto

**Solución**:
```typescript
// Verificar que el reference es: ORDER-{orderId}
const reference = `ORDER-${orderId}`

// En el webhook:
const orderId = parseInt(reference.replace('ORDER-', ''), 10)
```

**Verificar en logs**:
```
✅ Orden encontrada: ORDER-44 → ID: 44
```

### Problema: "This account has been deleted"

**Causa**: La cuenta tiene `is_deleted = true` en la tabla `profiles`

**Verificar**:
```sql
SELECT id, email, is_deleted FROM profiles WHERE email = 'test@example.com';
```

**Solución**:
```sql
-- Si es una cuenta de prueba, restaurarla:
UPDATE profiles SET is_deleted = false WHERE email = 'test@example.com';

-- O crear una nueva cuenta
```

---

## Cálculo Manual de Firma (Para Debugging)

Si necesitas verificar manualmente la firma:

```javascript
const crypto = require('crypto');

// Datos del webhook
const transactionId = '11984559-1761111547-48917';
const status = 'APPROVED';
const amountInCents = 10400000;
const secret = 'test_integrity_da6xTSFwIjmkBcbaEajluAEHar7jvewT';

// Propiedades en orden alfabético
const properties = [
  'transaction.amount_in_cents',
  'transaction.id', 
  'transaction.status'
].sort();

// Concatenar valores (NO las keys, solo los valores)
const concatenated = String(amountInCents) + transactionId + status;
console.log('Concatenated:', concatenated);

// Calcular SHA256
const signature = crypto
  .createHash('sha256')
  .update(concatenated + secret)
  .digest('hex');

console.log('Signature:', signature);
```

**Ejemplo esperado**:
```
Concatenated: 1040000011984559-1761111547-48917APPROVED
Signature: 0ef4b22037fb806aa5e76baef98c12dc04164e04a531b1faa2da1ff92c00d533
```

---

## Próximos Pasos

1. ✅ Webhook signature validation corregido
2. ✅ Protección de cuentas eliminadas implementada
3. ⏳ **Testing con webhook real de Wompi**
4. ⏳ Configurar URL de webhook en panel de Wompi
5. ⏳ Testing de flujo completo: pago → webhook → orden actualizada
6. ⏳ Testing de protección `is_deleted` en todos los flujos

---

## Comandos Útiles

```bash
# Ver logs del backend en tiempo real
npm run dev

# Monitorear webhooks con ngrok
ngrok http 3010 --log=stdout

# Probar endpoint de webhook manualmente
curl -X POST http://localhost:3010/wompi/webhook \
  -H "Content-Type: application/json" \
  -H "X-Event-Checksum: 0ef4b22037fb806aa5e76baef98c12dc04164e04a531b1faa2da1ff92c00d533" \
  -d '{
    "event": "transaction.updated",
    "data": {
      "transaction": {
        "id": "11984559-1761111547-48917",
        "status": "APPROVED",
        "reference": "ORDER-44",
        "amount_in_cents": 10400000
      }
    },
    "signature": {
      "checksum": "0ef4b22037fb806aa5e76baef98c12dc04164e04a531b1faa2da1ff92c00d533",
      "properties": ["transaction.id", "transaction.status", "transaction.amount_in_cents"]
    }
  }'
```
