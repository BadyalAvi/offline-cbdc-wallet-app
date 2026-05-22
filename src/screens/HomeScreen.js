import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, StatusBar, ActivityIndicator, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { markTransactionsAsSyncedInDB } from '../db/ledger';

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

// ── TxnRow component ───────────────────────────────────────────
function TxnRow({ txn, justSyncedIds }) {
  const isIn = txn.type === 'received';
  
  const displayStatus = justSyncedIds.includes(txn.id) ? 'synced' : txn.status; 

  return (
    <View style={s.txnRow}>
      <View style={[s.txnAvatar, { backgroundColor: isIn ? '#0d2318' : '#2a1010' }]}>
        <Text style={{ fontSize: 18 }}>{isIn ? '↙' : '↗'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.txnName}>{txn.name}</Text>
        <Text style={s.txnMeta}>{txn.time} · {txn.mode}</Text>
        {txn.note ? <Text style={s.txnNote}>{txn.note}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[s.txnAmt, { color: isIn ? C.green : C.red }]}>
          {isIn ? '+' : '-'}{fmt(txn.amount)}
        </Text>
        <View style={[s.statusBadge, { backgroundColor: displayStatus === 'synced' ? '#1a3a5c' : (displayStatus === 'confirmed' ? '#0d2318' : '#2a1f00') }]}>
          <Text style={[s.statusTxt, { color: displayStatus === 'synced' ? '#8B85FF' : (displayStatus === 'confirmed' ? C.green : C.amber) }]}>
            {displayStatus}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
//  HOME SCREEN
// ══════════════════════════════════════════════════════════════
export default function HomeScreen({ setScreen, ledger, balance, walletName, walletId }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [justSyncedIds, setJustSyncedIds] = useState([]); 

  const displayId = walletId ? walletId.slice(-8) : 'LOADING';
  const displayName = walletName || 'Loading Wallet...';

  const syncToCloud = async () => {
    const unsyncedTxns = ledger.filter(t => t.status !== 'synced');

    if (unsyncedTxns.length === 0) {
      Alert.alert('✅ Up to date', 'All offline transactions are already synced with the central bank vault.');
      return;
    }

    setIsSyncing(true);
    try {
      const SERVER_URL = 'https://offline-cbdc-sdk.onrender.com/api/sync'; 
      
      // ⚡ THE FIX: Inject the precise algorithmic timestamp into every transaction payload
      const chronologicallyStampedTxns = unsyncedTxns.map(txn => {
        return {
          ...txn,
          txn_timestamp: Date.now() // This feeds the Phase 1 Sorting Algorithm
        };
      });

      const payload = {
        walletId: walletId,
        offlineTransactions: chronologicallyStampedTxns
      };

      const response = await fetch(SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setJustSyncedIds(prev => [...prev, ...data.syncedIds]);

        Alert.alert(
          '✅ Algorithmic Sync Complete', 
          `${data.accepted} transactions sorted and settled to the master vault.`
        );
        
        if (data.syncedIds && data.syncedIds.length > 0) {
          await markTransactionsAsSyncedInDB(data.syncedIds);
        }

      } else {
        Alert.alert('Sync Failed', data.error || 'Unknown error from server');
      }
    } catch (error) {
      console.error("Sync Error:", error);
      Alert.alert('Network Error', 'Could not reach the master server. Are both your phone and computer on the same Wi-Fi network?');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.topBar}>
          <View>
            <Text style={s.greeting}>e-Rupee Wallet 🇮🇳</Text>
            <Text style={s.userName}>{displayName}</Text>
          </View>
          <View style={s.offlineBadge}>
            <View style={[s.dot, { backgroundColor: C.green }]} />
            <Text style={[s.offlineTxt, { color: C.green }]}>Offline ready</Text>
          </View>
        </View>

        <View style={s.balCard}>
          <Text style={s.balLabel}>Available Balance</Text>
          <Text style={s.balAmt}>{fmt(balance)}</Text>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, marginBottom: 20 }}>
            <Text style={s.balSub}>e-Rupee · Hardware Secured</Text>
            <TouchableOpacity style={s.syncBtn} onPress={syncToCloud} disabled={isSyncing}>
              {isSyncing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.syncTxt}>☁️ Sync</Text>}
            </TouchableOpacity>
          </View>

          <View style={s.capRow}>
            <View style={s.capItem}><Text style={s.capVal}>₹5,000</Text><Text style={s.capKey}>Daily limit</Text></View>
            <View style={s.capDiv} />
            <View style={s.capItem}><Text style={[s.capVal,{color:C.green}]}>✓ Active</Text><Text style={s.capKey}>RBI verified</Text></View>
            <View style={s.capDiv} />
            <View style={s.capItem}><Text style={s.capVal}>{displayId}</Text><Text style={s.capKey}>Wallet ID</Text></View>
          </View>
        </View>

        <View style={s.actionRow}>
          {[{icon:'↑',label:'Send',screen:'send'},{icon:'↓',label:'Receive',screen:'receive'},{icon:'⊡',label:'Scan QR',screen:'scan'},{icon:'☰',label:'History',screen:'history'}].map(a=>(
            <TouchableOpacity key={a.label} style={s.actionBtn} onPress={()=>setScreen(a.screen)}>
              <Text style={s.actionIcon}>{a.icon}</Text>
              <Text style={s.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.banner}>
          <Text style={{fontSize:22}}>🔐</Text>
          <View style={{flex:1}}>
            <Text style={s.bannerTitle}>Hardware enclave active</Text>
            <Text style={s.bannerSub}>Your private key is secured in the device's hardware chip.</Text>
          </View>
        </View>

        <Text style={s.sectionTitle}>Recent transactions</Text>
        {ledger.slice(0,4).map(t=><TxnRow key={t.id} txn={t} justSyncedIds={justSyncedIds}/>)}
        
        <TouchableOpacity style={s.viewAll} onPress={()=>setScreen('history')}>
          <Text style={s.viewAllTxt}>View all transactions →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:        { flex:1, backgroundColor:C.bg },
  topBar:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:20, paddingTop:16 },
  greeting:    { fontSize:13, color:C.muted },
  userName:    { fontSize:20, fontWeight:'700', color:C.txt, marginTop:2 },
  offlineBadge:{ flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:6, borderRadius:20, backgroundColor:'#1a2a1a', gap:6 },
  dot:         { width:7, height:7, borderRadius:4 },
  offlineTxt:  { fontSize:12, fontWeight:'600' },
  balCard:     { margin:16, borderRadius:20, backgroundColor:C.accent, padding:24 },
  balLabel:    { fontSize:13, color:'rgba(255,255,255,0.7)', marginBottom:4 },
  balAmt:      { fontSize:42, fontWeight:'800', color:'#fff', letterSpacing:-1 },
  balSub:      { fontSize:13, color:'rgba(255,255,255,0.6)' },
  syncBtn:     { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  syncTxt:     { color: '#fff', fontSize: 12, fontWeight: '700' },
  capRow:      { flexDirection:'row', backgroundColor:'rgba(0,0,0,0.2)', borderRadius:12, padding:12 },
  capItem:     { flex:1, alignItems:'center' },
  capDiv:      { width:1, backgroundColor:'rgba(255,255,255,0.2)' },
  capVal:      { fontSize:13, fontWeight:'700', color:'#fff' },
  capKey:      { fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:2 },
  actionRow:   { flexDirection:'row', justifyContent:'space-between', marginHorizontal:16, marginBottom:16, gap:10 },
  actionBtn:   { flex:1, backgroundColor:C.card, borderRadius:14, paddingVertical:16, alignItems:'center', borderWidth:0.5, borderColor:C.border },
  actionIcon:  { fontSize:22, color:C.accentLt, marginBottom:4 },
  actionLabel: { fontSize:12, color:C.txt, fontWeight:'600' },
  banner:      { margin:16, marginTop:0, backgroundColor:'#0d1f2d', borderRadius:14, padding:14, flexDirection:'row', alignItems:'flex-start', gap:12, borderWidth:0.5, borderColor:'#1a3a5c' },
  bannerTitle: { fontSize:13, fontWeight:'700', color:C.txt, marginBottom:3 },
  bannerSub:   { fontSize:12, color:C.muted, lineHeight:17 },
  sectionTitle:{ fontSize:16, fontWeight:'700', color:C.txt, marginHorizontal:16, marginBottom:8 },
  txnRow:      { flexDirection:'row', alignItems:'center', marginHorizontal:16, marginBottom:10, backgroundColor:C.card, borderRadius:14, padding:14, gap:12, borderWidth:0.5, borderColor:C.border },
  txnAvatar:   { width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center' },
  txnName:     { fontSize:14, fontWeight:'600', color:C.txt, marginBottom:2 },
  txnMeta:     { fontSize:12, color:C.muted },
  txnNote:     { fontSize:11, color:C.accentLt, marginTop:2 },
  txnAmt:      { fontSize:15, fontWeight:'700', marginBottom:4 },
  statusBadge: { paddingHorizontal:8, paddingVertical:2, borderRadius:6 },
  statusTxt:   { fontSize:10, fontWeight:'600', textTransform:'uppercase' },
  viewAll:     { alignItems:'center', padding:20 },
  viewAllTxt:  { color:C.accentLt, fontWeight:'600' },
});