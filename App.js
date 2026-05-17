import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

// ── Import our Engines ─────────────────────────────────────────
import { initKeys, getPublicKey } from './src/crypto/keys';
import { initLedger, getTransactions, getBalance } from './src/db/ledger';

// ── Import our Screens ─────────────────────────────────────────
import HomeScreen from './src/screens/HomeScreen';
import SendScreen from './src/screens/SendScreen';
import ScanScreen from './src/screens/ScanScreen';
import ReceiveScreen from './src/screens/ReceiveScreen';
import HistoryScreen from './src/screens/HistoryScreen';

// ══════════════════════════════════════════════════════════════
//  ROOT APPLICATION
// ══════════════════════════════════════════════════════════════
export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [screen, setScreen]   = useState('home');
  
  // App State
  const [balance, setBalance]       = useState(0);
  const [ledger, setLedger]         = useState([]);
  const [walletId, setWalletId]     = useState('');
  const [walletName, setWalletName] = useState('Badyal Singh'); 

  // 1. Boot up sequence
  useEffect(() => {
    async function bootEngines() {
      try {
        await initKeys();
        const pubKey = getPublicKey();
        setWalletId(`IN-ERUPEE-${pubKey.substring(0, 8).toUpperCase()}`);
        await initLedger();
        await refreshData();
        setIsReady(true);
      } catch (error) {
        console.error("Boot sequence failed:", error);
      }
    }
    bootEngines();
  }, []);

  // 2. Refresh data from the database
  const refreshData = async () => {
    const currentBalance = await getBalance();
    const history = await getTransactions();
    setBalance(currentBalance);
    setLedger(history);
  };

  // 3. Loading State
  if (!isReady) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={s.loadingContainer}>
          <ActivityIndicator size="large" color="#6C63FF" />
          <Text style={s.loadingText}>Securing Enclave & Loading Ledger...</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // 4. Props to pass to screens
  const screenProps = {
    setScreen,
    balance,
    ledger,
    walletId,
    walletName,
    onReceive: refreshData 
  };

  // 5. Traffic Cop (Router) wrapped in the Provider
  const renderScreen = () => {
    switch (screen) {
      case 'home':    return <HomeScreen {...screenProps} />;
      case 'send':    return <SendScreen {...screenProps} />;
      case 'receive': return <ReceiveScreen {...screenProps} />;
      case 'scan':    return <ScanScreen {...screenProps} />;
      case 'history': return <HistoryScreen {...screenProps} />;
      default:        return <HomeScreen {...screenProps} />;
    }
  };

  return (
    <SafeAreaProvider>
      {renderScreen()}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0A0E1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 16,
    fontSize: 14,
    fontWeight: '600'
  }
});