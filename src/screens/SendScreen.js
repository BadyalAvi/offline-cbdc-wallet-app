import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, SafeAreaView, Alert, TextInput, ActivityIndicator, NativeModules
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { signPayment } from '../crypto/keys';
import { insertTransaction } from '../db/ledger'; 

// Extract our custom Java radio module
const { HceModule } = NativeModules;

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
const shortId = () => Math.random().toString(36).substr(2, 8).toUpperCase();

export default function SendScreen({ setScreen, balance, walletName, walletId }) {
  const [amount, setAmount] = useState('');
  const [note,   setNote]   = useState('');
  const [txData, setTxData] = useState(null);
  const [mode,   setMode]   = useState('QR'); // 'QR' or 'NFC'
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const numPad = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
  
  const press = (k) => {
    if (k==='⌫'){setAmount(p=>p.slice(0,-1));return;}
    if (k==='') return;
    if (amount.length>=7) return;
    setAmount(p=>p+k);
  };

  // Cleanup NFC memory if we leave the screen or cancel
  useEffect(() => {
    return () => {
      if (isBroadcasting && HceModule) {
        HceModule.clearPayload();
      }
    };
  }, [isBroadcasting]);

  const generatePayment = async (selectedMode) => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { Alert.alert('Invalid', 'Enter a valid amount'); return; }
    if (amt > balance) { Alert.alert('Insufficient balance', 'You do not have enough e-Rupee'); return; }
    if (amt > 5000) { Alert.alert('Limit exceeded', 'Max ₹5,000 per transaction'); return; }
    
    // 1. GENERATE DYNAMIC PAYLOAD
    const uniqueTxnId = shortId(); 
    
    const payload = { 
      type: 'CBDC_PAYMENT', 
      version: '1.0', 
      txnId: uniqueTxnId, 
      fromId: walletId, 
      fromName: walletName, 
      amount: amt, 
      note: note || 'Payment', 
      timestamp: Date.now(), 
      expiry: Date.now() + 5 * 60 * 1000 
    };

    try {
      const signedTxn = signPayment(payload);
      setTxData(JSON.stringify(signedTxn));
      setMode(selectedMode);

      // We package the SQLite data, but WE DO NOT SAVE IT YET!
      const dbRecordToSaveLater = {
        id: uniqueTxnId,
        type: 'sent',       
        name: 'Outgoing Payment', 
        amount: amt,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: selectedMode,
        status: 'pending',  
        note: note || `Sent via ${selectedMode}`,
        raw_signature: signedTxn.signature 
      };

      if (selectedMode === 'NFC') {
        startHardwareBroadcast(JSON.stringify(signedTxn), dbRecordToSaveLater);
      } else {
        // If it's a QR code, we still have to deduct immediately (the QR flaw we discussed)
        await insertTransaction(dbRecordToSaveLater);
      }
    } catch (error) {
      console.error("Signing Error:", error);
      Alert.alert('Security Error', `Reason: ${error.message}`);
    }
  };

  const startHardwareBroadcast = async (dataString, dbRecord) => {
    try {
      if (!HceModule) {
        Alert.alert("Bridge Error", "Native Java module not found. Did you compile the app?");
        return;
      }

      setIsBroadcasting(true);
      await HceModule.setCryptoPayload(dataString);
      
      // ⚡ THE NEW UPGRADE: The Polling Loop
      // We check the hardware every 500ms to see if Phone B sent the receipt
      const checkLoop = async (attempts = 0) => {
        // If 60 seconds pass with no tap, we time out to protect the user
        if (attempts > 120) { 
            cancelNfc();
            Alert.alert("Timeout", "No receiver detected. Transaction cancelled. No funds were deducted.");
            return;
        }

        const receipt = await HceModule.checkReceipt();
        
        if (receipt !== "WAITING" && receipt.startsWith("OK_")) {
            // THE RECEIPT SECURED! IT IS NOW SAFE TO DEDUCT THE MONEY.
            await insertTransaction(dbRecord);
            await HceModule.clearPayload();
            setIsBroadcasting(false);
            
            Alert.alert("✅ Settlement Complete", "Receiver cryptographically confirmed the funds. Balance safely deducted.");
            setScreen('home');
            return;
        }
        
        // If still waiting, loop again in half a second
        setTimeout(() => checkLoop(attempts + 1), 500);
      };

      // Start the loop!
      checkLoop();

    } catch (ex) {
      console.warn('NFC Bridge Error', ex);
      setIsBroadcasting(false);
      Alert.alert('Hardware Error', 'Failed to load data into NFC chip memory.');
    }
  };

  const cancelNfc = async () => {
    setIsBroadcasting(false);
    setTxData(null);
    if (HceModule) {
      await HceModule.clearPayload(); // Wipe the hardware memory
    }
    // Notice we do NOT go home automatically here, allowing the user to try again if they hit cancel
  };

  if (txData) {
    const d = JSON.parse(txData);
    return (
      <SafeAreaView style={s.root}>
        <View style={s.screenHeader}>
          <TouchableOpacity onPress={() => mode === 'NFC' ? cancelNfc() : setTxData(null)}>
            <Text style={s.backBtn}>✕ Cancel</Text>
          </TouchableOpacity>
          <Text style={s.screenTitle}>
            {mode === 'NFC' ? 'Tap to Pay' : 'Show to receiver'}
          </Text>
          <View style={{width:70}}/>
        </View>
        <ScrollView contentContainerStyle={{alignItems:'center',paddingVertical:28}}>
          <View style={s.qrCard}>
            <Text style={s.qrTitle}>
               {mode === 'NFC' ? 'Hold phones together' : 'Receiver scans this QR'}
            </Text>
            
            {mode === 'QR' ? (
              <View style={s.qrWrap}>
                <QRCode value={txData} size={220} backgroundColor="#ffffff" color="#000000"/>
              </View>
            ) : (
              <View style={[s.qrWrap, { justifyContent: 'center', alignItems: 'center', width: 220, height: 220 }]}>
                <Text style={{fontSize: 60}}>📳</Text>
                <ActivityIndicator color={C.accent} size="large" style={{marginTop: 20}}/>
              </View>
            )}

            <Text style={s.qrAmt}>{fmt(d.amount)}</Text>
            <Text style={s.qrNote}>{d.note}</Text>
            <View style={{marginTop:12,gap:4}}>
              <Text style={s.qrInfoTxt}>From: {d.fromName}</Text>
              <Text style={s.qrInfoTxt}>TXN ID: {d.txnId}</Text>
              <Text style={s.qrInfoTxt}>Expires: 5 minutes</Text>
            </View>
            <View style={s.qrBadge}>
              <Text style={s.qrBadgeTxt}>
                🔐 Hardware Signed · {mode === 'NFC' ? 'NFC Active' : 'Offline'}
              </Text>
            </View>
          </View>
          <Text style={{fontSize:12,color:C.muted,textAlign:'center',lineHeight:20,marginHorizontal:24}}>
            {mode === 'NFC' 
              ? "Receiver taps 'Receive via Tap' and holds their phone against yours."
              : "Receiver opens wallet → taps Scan QR → points camera here."}
            {'\n'}No internet needed.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.screenHeader}>
        <TouchableOpacity onPress={()=>setScreen('home')}><Text style={s.backBtn}>← Back</Text></TouchableOpacity>
        <Text style={s.screenTitle}>Send e-Rupee</Text>
        <View style={{width:60}}/>
      </View>
      <ScrollView contentContainerStyle={{alignItems:'center',paddingTop:28,paddingBottom:40}}>
        <Text style={s.sendLabel}>Enter amount</Text>
        <Text style={s.sendAmount}>₹{amount||'0'}</Text>
        <Text style={{fontSize:13,color:C.muted,marginBottom:16}}>Balance: {fmt(balance)}</Text>
        <TextInput style={s.noteInput} placeholder="Add a note (optional)" placeholderTextColor={C.muted} value={note} onChangeText={setNote} maxLength={40}/>
        <View style={s.numGrid}>
          {numPad.map((k,i)=>(
            <TouchableOpacity key={i} style={[s.numKey,k==='⌫'&&{backgroundColor:C.border}]} onPress={()=>press(k)}>
              <Text style={s.numTxt}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <TouchableOpacity style={s.genBtn} onPress={() => generatePayment('QR')}>
          <Text style={s.genBtnTxt}>▦  Generate QR Code</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[s.genBtn, {backgroundColor: C.card, borderWidth: 1, borderColor: C.accentLt, marginTop: 12}]} onPress={() => generatePayment('NFC')}>
          <Text style={[s.genBtnTxt, {color: C.accentLt}]}>📳  Tap to Pay (NFC)</Text>
        </TouchableOpacity>

        <Text style={{fontSize:12,color:C.muted,marginTop:16,textAlign:'center'}}>Cryptographically signed by Hardware Enclave</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:        { flex:1, backgroundColor:C.bg },
  screenHeader:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, borderBottomWidth:0.5, borderColor:C.border },
  backBtn:     { color:C.accentLt, fontWeight:'600', fontSize:15, width:80 },
  screenTitle: { fontSize:17, fontWeight:'700', color:C.txt },
  sendLabel:   { fontSize:15, color:C.muted, marginBottom:6 },
  sendAmount:  { fontSize:52, fontWeight:'800', color:C.txt, letterSpacing:-2, marginBottom:4 },
  noteInput:   { width:'80%', backgroundColor:C.card, borderRadius:12, padding:14, color:C.txt, fontSize:14, borderWidth:0.5, borderColor:C.border, marginBottom:20, textAlign:'center' },
  numGrid:     { flexDirection:'row', flexWrap:'wrap', width:280, justifyContent:'center', gap:10, marginBottom:24 },
  numKey:      { width:80, height:56, borderRadius:14, backgroundColor:C.card, alignItems:'center', justifyContent:'center', borderWidth:0.5, borderColor:C.border },
  numTxt:      { fontSize:22, fontWeight:'600', color:C.txt },
  genBtn:      { width:'85%', backgroundColor:C.accent, borderRadius:16, padding:18, alignItems:'center', marginTop:8 },
  genBtnTxt:   { color:'#fff', fontWeight:'700', fontSize:16 },
  qrCard:      { backgroundColor:C.card, borderRadius:20, padding:24, alignItems:'center', marginBottom:20, width:'88%', borderWidth:0.5, borderColor:C.border },
  qrTitle:     { fontSize:15, fontWeight:'700', color:C.txt, marginBottom:16 },
  qrWrap:      { backgroundColor:'#fff', padding:12, borderRadius:12, marginBottom:16 },
  qrAmt:       { fontSize:28, fontWeight:'800', color:C.green, marginBottom:2 },
  qrNote:      { fontSize:14, color:C.muted },
  qrInfoTxt:   { fontSize:12, color:C.muted, textAlign:'center' },
  qrBadge:     { backgroundColor:'#0d1f2d', borderRadius:8, paddingHorizontal:12, paddingVertical:6, marginTop:12 },
  qrBadgeTxt:  { fontSize:11, color:C.accentLt, textAlign:'center' },
});