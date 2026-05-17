import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Vibration, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { verifyPayment } from '../crypto/keys';
import { insertTransaction } from '../db/ledger';

// ── colour tokens ──────────────────────────────────────────────
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

const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 });

// ══════════════════════════════════════════════════════════════
//  SCAN QR SCREEN (Fallback)
// ══════════════════════════════════════════════════════════════
export default function ScanScreen({ setScreen, onReceive, walletId }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned,   setScanned]   = useState(false);
  const [result,    setResult]    = useState(null);

  // ── 1. The Core Verification Logic ──
  const processPayload = (dataString, method) => {
    if (scanned) return;
    setScanned(true);
    Vibration.vibrate(100);
    
    let parsed;
    try { 
      parsed = JSON.parse(dataString); 
    } catch { 
      Alert.alert('Invalid Data', `Not a valid e-Rupee payload (${method})`);
      setScanned(false);
      return; 
    }
    
    if (parsed.type !== 'CBDC_PAYMENT') { Alert.alert('Wrong Data', 'This is not a payment payload'); setScanned(false); return; }
    if (Date.now() > parsed.expiry) { Alert.alert('Expired', 'Transaction has expired. Ask sender to regenerate.'); setScanned(false); return; }
    if (parsed.fromId === walletId) { Alert.alert('Error', 'Cannot pay yourself'); setScanned(false); return; }
    
    // Hardware verification
    const isValid = verifyPayment(parsed);
    setResult({ ...parsed, valid: isValid, method });
  };

  // ── 2. QR Code Handler ──
  const handleQRScan = ({ data }) => {
    processPayload(data, 'Offline QR');
  };

  // ── 3. Write to Database ──
  const confirm = async () => {
    const txnToSave = {
      id: result.txnId,
      type: 'received',
      name: result.fromName,
      amount: result.amount,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      mode: result.method, 
      status: 'confirmed',
      note: result.note,
      raw_signature: result.signature
    };

    const saved = await insertTransaction(txnToSave);
    
    if (saved) {
      if(onReceive) onReceive(); 
      Alert.alert(
        '✅ Payment received!',
        `${fmt(result.amount)} from ${result.fromName}\n\nVerified via ${result.method}.`,
        [{ text: 'OK', onPress: () => setScreen('home') }]
      );
    } else {
      Alert.alert('Database Error', 'Failed to save the transaction to your local ledger.');
    }
  };

  // ── UI States ──

  if (!permission) {
    return (
      <SafeAreaView style={[s.root, {justifyContent:'center', alignItems:'center'}]}>
        <ActivityIndicator color={C.accentLt} size="large" />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[s.root, {padding: 24, justifyContent: 'center'}]}>
        <Text style={s.screenTitle}>Camera Permission Required</Text>
        <Text style={{color: C.muted, marginTop: 8, lineHeight: 22, textAlign: 'center'}}>
          We need access to your camera to scan payment QRs offline.
        </Text>
        <TouchableOpacity style={[s.genBtn, {marginTop: 20}]} onPress={requestPermission}>
          <Text style={s.genBtnTxt}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.genBtn, {marginTop: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border}]} onPress={()=>setScreen('home')}>
          <Text style={[s.genBtnTxt, {color: C.txt}]}>← Go home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (result) return (
    <SafeAreaView style={s.root}>
      <View style={s.screenHeader}>
        <TouchableOpacity onPress={()=>{setResult(null);setScanned(false);}}><Text style={s.backBtn}>← Rescan</Text></TouchableOpacity>
        <Text style={s.screenTitle}>Confirm payment</Text>
        <View style={{width:70}}/>
      </View>
      <View style={{flex:1,padding:20}}>
        <View style={[s.confirmCard,{borderColor:result.valid?C.green:C.red}]}>
          <Text style={{fontSize:44,textAlign:'center',marginBottom:10}}>{result.valid?'🔐':'⚠️'}</Text>
          <Text style={[s.confirmStatus,{color:result.valid?C.green:C.red}]}>
            {result.valid ? 'Signature verified ✓' : 'WARNING: Invalid signature!'}
          </Text>
          {[['Amount',fmt(result.amount),C.green,22],['From',result.fromName,C.txt,15],['Note',result.note,C.txt,15],['TXN ID',result.txnId,C.muted,12],['Mode', result.method,C.txt,13]].map(([k,v,col,sz])=>(
            <View key={k} style={s.confirmRow}>
              <Text style={s.confirmKey}>{k}</Text>
              <Text style={[s.confirmVal,{color:col,fontSize:sz}]}>{v}</Text>
            </View>
          ))}
        </View>
        {result.valid && (
          <TouchableOpacity style={[s.genBtn,{backgroundColor:C.green,marginTop:16}]} onPress={confirm}>
            <Text style={s.genBtnTxt}>✓  Accept Payment</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[s.genBtn,{backgroundColor:C.card,marginTop:10}]} onPress={()=>{setResult(null);setScanned(false);}}>
          <Text style={[s.genBtnTxt,{color:C.muted}]}>Rescan</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.root}>
      <View style={s.screenHeader}>
        <TouchableOpacity onPress={()=>setScreen('home')}><Text style={s.backBtn}>← Back</Text></TouchableOpacity>
        <Text style={s.screenTitle}>Receive Payment</Text>
        <View style={{width:70}}/>
      </View>
      
      <View style={{flex:1}}>
        <CameraView 
          style={StyleSheet.absoluteFillObject} 
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleQRScan}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        />
        <View style={s.scanOverlay}>
          <View style={s.scanFrame}>
            <View style={[s.corner,{top:0,left:0,borderTopWidth:3,borderLeftWidth:3}]}/>
            <View style={[s.corner,{top:0,right:0,borderTopWidth:3,borderRightWidth:3}]}/>
            <View style={[s.corner,{bottom:0,left:0,borderBottomWidth:3,borderLeftWidth:3}]}/>
            <View style={[s.corner,{bottom:0,right:0,borderBottomWidth:3,borderRightWidth:3}]}/>
          </View>
          <Text style={s.scanTip}>Point camera at sender's QR</Text>
          
          {/* ⚡ THE ROUTING FIX: This button now sends them to the correct Receive Screen */}
          <TouchableOpacity style={[s.genBtn, {width: '70%', marginTop: 40, backgroundColor: C.accentLt}]} onPress={() => setScreen('receive')}>
            <Text style={s.genBtnTxt}>📳 Switch to NFC Tap</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:        { flex:1, backgroundColor:C.bg },
  screenHeader:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, borderBottomWidth:0.5, borderColor:C.border },
  backBtn:     { color:C.accentLt, fontWeight:'600', fontSize:15, width:80 },
  screenTitle: { fontSize:17, fontWeight:'700', color:C.txt },
  genBtn:      { width:'100%', backgroundColor:C.accent, borderRadius:16, padding:18, alignItems:'center' },
  genBtnTxt:   { color:'#fff', fontWeight:'700', fontSize:16 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, alignItems:'center', justifyContent:'center' },
  scanFrame:   { width:240, height:240, position:'relative', marginBottom:24 },
  corner:      { position:'absolute', width:30, height:30, borderColor:C.accentLt },
  scanTip:     { color:'#fff', fontSize:15, fontWeight:'600', textAlign:'center', backgroundColor:'rgba(0,0,0,0.6)', paddingHorizontal:16, paddingVertical:8, borderRadius:10 },
  confirmCard: { backgroundColor:C.card, borderRadius:20, padding:24, borderWidth:1.5 },
  confirmStatus:{ fontSize:16, fontWeight:'700', textAlign:'center', marginBottom:20 },
  confirmRow:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:10, borderBottomWidth:0.5, borderColor:C.border },
  confirmKey:  { fontSize:13, color:C.muted },
  confirmVal:  { fontSize:15, fontWeight:'600', color:C.txt },
});