// Configuración de cobro compartida por las 4 apps (quien-eres, who-are-you, quien-es-tu-pareja, who-is-your-partner).
// Para activar PayPal fuera de Costa Rica basta con pegar aquí los enlaces de los botones de PayPal:
//   usd.link → botón de US$2.00 (todo el mundo salvo CR y los países de eurCountries)
//   eur.link → botón de 2,00 € (España)
// Mientras un enlace esté vacío ('') la app muestra "PayPal aún no disponible" y NO desbloquea nada.
window.QER_PAY = {
  sinpe: { phone: '8777-2993', amountCRC: 1000 },
  usd: { amount: 2, link: '' },
  eur: { amount: 2, link: '' },
  eurCountries: ['ES'],
  whatsapp: '50687772993',
  email: 'bonillapretiz@gmail.com'
};
