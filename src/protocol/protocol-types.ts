/** Bluetooth Protocol Commands (AT+BKXXX) — aligned with scooter-server */
export type BluetoothCommandType =
  | 'AT+BKSCT'
  | 'AT+BKECP'
  | 'AT+BKLED'
  | 'AT+BKLOC'
  | 'AT+BKWRN'
  | 'AT+BKPWD'
  | 'AT+BKINF'
  | 'AT+BKVER';
