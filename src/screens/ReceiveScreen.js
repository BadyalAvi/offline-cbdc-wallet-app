import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import { insertTransaction } from '../db/ledger'; 

const C = {
  bg:       '#0A0E1A',
  card:     '#111827',
  border:   '#1F2937',
  accent:   '#6C63FF',
  accentLt: '#8B85FF',
  green:    '#10B981',
  red:      '#EF4444',
  amber:    '#F59E0B',
  txt:      '#F9FAFB',
  muted:    '#9CA3AF',
};

export default function ReceiveScreen({ setScreen, walletName }) {
  const [isListening, setIsListening] = useState(true);

  useEffect(() => {
    startHardwareRadio();
    return () => {
      NfcManager.cancelTechnologyRequest(); 
    };
  }, []);

  const startHardwareRadio = async () => {
    try {
      setIsListening(true);
      
      await NfcManager.requestTechnology(NfcTech.IsoDep);
      await new Promise(resolve => setTimeout(resolve, 100));

      const selectApdu = [0x00, 0xA4, 0x04, 0x00, 0x07, 0xF0, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06];
      await NfcManager.isoDepHandler.transceive(selectApdu);

      const requestApdu = [0x80, 0x01, 0x02, 0x03];
      const payloadResponse = await NfcManager.isoDepHandler.transceive(requestApdu);

      if (!payloadResponse || payloadResponse.length <= 2) {
        throw new Error("Empty response from sender phone.");
      }

      const payloadBytes = payloadResponse.slice(0, -2);
      
      // Fallback clean decoding
      let payloadString = "";
      try {
        payloadString = String.fromCharCode.apply(null, payloadBytes);
      } catch (e) {
        payloadString = Array.from(payloadBytes).map(b => String.fromCharCode(b)).join('');
      }

      const rawData = JSON.parse(payloadString);

      // ⚡ DECOMPRESSION DECODER
      // Expands the compressed NFC packet back to standard JSON
      const transactionData = rawData.T ? {
        txnId: rawData.I,
        fromName: rawData.N,
        amount: rawData.A,
        note: rawData.O,
        signature: rawData.S
      } : rawData;

      const newTxn = {
        id: transactionData.txnId, 
        type: 'received',
        name: transactionData.fromName || 'Incoming Tap', 
        amount: parseFloat(transactionData.amount),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: 'NFC Tap',
        status: 'confirmed',
        note: transactionData.note || 'Offline Tap',
        raw_signature: transactionData.signature || 'dev_bypass' 
      };

      const success = await insertTransaction(newTxn);

      if (success) {
        const receiptString = "OK_" + transactionData.txnId;
        const receiptBytes = [];
        for (let i = 0; i < receiptString.length; i++) {
          receiptBytes.push(receiptString.charCodeAt(i));
        }
        const receiptApdu = [0x80, 0x02, ...receiptBytes];
        await NfcManager.isoDepHandler.transceive(receiptApdu);

        Alert.alert("💸 Payment Received!", `Successfully extracted ₹${transactionData.amount} via hardware tap.`);
        setScreen('home'); 
      } else {
        Alert.alert("Database Error", "Failed to write txn to SQLite.");
      }

    } catch (error) {
      console.warn('NFC Error:', error);
      Alert.alert("NFC Debug Info", `Error: ${error.message || error}`);
    } finally {
      NfcManager.cancelTechnologyRequest();
      setIsListening(false);
    }
  };

  const cancelNfc = () => {
    setIsListening(false);
    NfcManager.cancelTechnologyRequest();
    setScreen('home');
  };

  return (
    <SafeAreaView style={s.root}>
      <View style={s.screenHeader}>
        <TouchableOpacity onPress={cancelNfc}><Text style={s.backBtn}>← Back</Text></TouchableOpacity>
        <Text style={s.screenTitle}>Receive Payment</Text>
        <View style={{width:60}}/>
      </View>
      
      <View style={{flex:1}}>
        <View style={s.scanOverlay}>
          <View style={s.iconWrapper}>
            <Text style={{fontSize: 70}}>📳</Text>
          </View>
          <Text style={s.readyTitle}>Ready to Receive</Text>
          <Text style={s.readySub}>Hold the back of your phone against the sender's phone to transfer e-Rupee.</Text>
          <ActivityIndicator color={C.accentLt} size="large" style={{marginTop: 40, marginBottom: 40}} />
          <TouchableOpacity style={s.cancelBtn} onPress={cancelNfc}>
            <Text style={s.cancelBtnTxt}>Cancel NFC</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex:1, backgroundColor:C.bg },
  screenHeader:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16 },
  backBtn: { color:C.accentLt, fontWeight:'600', fontSize:15, width:80 },
  screenTitle: { fontSize:17, fontWeight:'700', color:C.txt },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems:'center', justifyContent:'center', paddingHorizontal: 30 },
  iconWrapper: { backgroundColor: '#F59E0B', width: 120, height: 120, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 30, shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 8 },
  readyTitle: { fontSize: 22, fontWeight: '700', color: C.txt, marginBottom: 12 },
  readySub: { fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22 },
  cancelBtn: { width: '100%', backgroundColor: C.card, borderRadius: 16, padding: 18, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cancelBtnTxt:{ color: C.txt, fontWeight: '600', fontSize: 16 },
});