const { nip19 } = require('nostr-tools');

// Reemplaza 'nsec...' con tu clave privada nsec
const nsec = 'TU_NSEC_AQUI'; 

// Función para convertir Uint8Array a una cadena hexadecimal
function toHexString(byteArray) {
  return Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('');
}

try {
  const { data } = nip19.decode(nsec);
  
  if (data instanceof Uint8Array) {
    const hexKey = toHexString(data);
    console.log('✅ Tu clave privada en hexadecimal es:');
    console.log(hexKey);
    console.log('\n¡Copia esta clave y pégala en tu archivo .env!');
  } else {
    console.error('❌ El formato de la clave decodificada no es el esperado.');
  }

} catch (error) {
  console.error('❌ Error al decodificar la clave:', error.message);
  console.error('Asegúrate de que la clave nsec sea correcta.');
}
