import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getTransactions } from '../db/ledger';

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

// ── TxnRow Component (Local to History) ────────────────────────
function TxnRow({ txn }) {
  const isIn = txn.type === 'received';

  // ⚡ THE UPGRADE: Dynamic status colors to support 'pending', 'confirmed', and 'synced'
  let statusBg = '#2a1f00'; 
  let statusColor = C.amber;

  if (txn.status === 'confirmed') {
    statusBg = '#0d2318';
    statusColor = C.green;
  } else if (txn.status === 'synced') {
    statusBg = '#1a3a5c';
    statusColor = C.accentLt;
  }

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
        <View style={[s.statusBadge, { backgroundColor: statusBg }]}>
          <Text style={[s.statusTxt, { color: statusColor }]}>{txn.status}</Text>
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
//  HISTORY SCREEN
// ══════════════════════════════════════════════════════════════
export default function HistoryScreen({ setScreen }) {
  const [filter, setFilter] = useState('all');
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch the permanent transaction history from SQLite when the screen loads
  useEffect(() => {
    const loadHistory = async () => {
      const data = await getTransactions();
      setLedger(data);
      setLoading(false);
    };
    loadHistory();
  }, []);

  const filtered = filter === 'all' ? ledger : ledger.filter(t => t.type === filter);
  const totalIn  = ledger.filter(t => t.type === 'received').reduce((a, t) => a + t.amount, 0);
  const totalOut = ledger.filter(t => t.type === 'sent').reduce((a, t) => a + t.amount, 0);

  if (loading) {
    return (
      <SafeAreaView style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={C.accentLt} />
        <Text style={{ color: C.muted, marginTop: 12 }}>Loading Ledger...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.screenHeader}>
        <TouchableOpacity onPress={()=>setScreen('home')}><Text style={s.backBtn}>← Back</Text></TouchableOpacity>
        <Text style={s.screenTitle}>Transaction history</Text>
        <View style={{width:60}}/>
      </View>
      
      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={[s.statVal, {color: C.green}]}>{fmt(totalIn)}</Text>
          <Text style={s.statKey}>Total received</Text>
        </View>
        <View style={s.statCard}>
          <Text style={[s.statVal, {color: C.red}]}>{fmt(totalOut)}</Text>
          <Text style={s.statKey}>Total sent</Text>
        </View>
      </View>
      
      <View style={s.filterRow}>
        {['all','received','sent'].map(f=>(
          <TouchableOpacity key={f} style={[s.filterBtn, filter===f && s.filterBtnActive]} onPress={()=>setFilter(f)}>
            <Text style={[s.filterTxt, filter===f && s.filterTxtActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      
      <ScrollView>
        {filtered.length === 0
          ? <Text style={{color:C.muted,textAlign:'center',marginTop:40}}>No transactions yet</Text>
          : filtered.map(t => <TxnRow key={t.id} txn={t}/>)
        }
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:        { flex:1, backgroundColor:C.bg },
  screenHeader:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, borderBottomWidth:0.5, borderColor:C.border },
  backBtn:     { color:C.accentLt, fontWeight:'600', fontSize:15, width:80 },
  screenTitle: { fontSize:17, fontWeight:'700', color:C.txt },
  statsRow:    { flexDirection:'row', margin:16, gap:12 },
  statCard:    { flex:1, backgroundColor:C.card, borderRadius:14, padding:14, alignItems:'center', borderWidth:0.5, borderColor:C.border },
  statVal:     { fontSize:18, fontWeight:'800', marginBottom:4 },
  statKey:     { fontSize:12, color:C.muted },
  filterRow:   { flexDirection:'row', marginHorizontal:16, marginBottom:12, backgroundColor:C.card, borderRadius:12, padding:4, borderWidth:0.5, borderColor:C.border },
  filterBtn:   { flex:1, paddingVertical:8, alignItems:'center', borderRadius:10 },
  filterBtnActive: { backgroundColor:C.accent },
  filterTxt:   { fontSize:13, color:C.muted, fontWeight:'600' },
  filterTxtActive: { color:'#fff' },
  txnRow:      { flexDirection:'row', alignItems:'center', marginHorizontal:16, marginBottom:10, backgroundColor:C.card, borderRadius:14, padding:14, gap:12, borderWidth:0.5, borderColor:C.border },
  txnAvatar:   { width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center' },
  txnName:     { fontSize:14, fontWeight:'600', color:C.txt, marginBottom:2 },
  txnMeta:     { fontSize:12, color:C.muted },
  txnNote:     { fontSize:11, color:C.accentLt, marginTop:2 },
  txnAmt:      { fontSize:15, fontWeight:'700', marginBottom:4 },
  statusBadge: { paddingHorizontal:8, paddingVertical:2, borderRadius:6 },
  statusTxt:   { fontSize:10, fontWeight:'600', textTransform:'uppercase' },
});