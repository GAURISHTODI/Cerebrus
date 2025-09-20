// CerebrusProject/client/app/index.tsx (Final Hybrid Version)

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Dimensions,
  GestureResponderEvent,
  ScrollView,
  StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity, View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

// --- Configuration ---
const SERVER_URL = 'https://0ec470e76fe0.ngrok-free.app'; // Remember to update this!
// ---------------------

const { height, width } = Dimensions.get('window');
const COLORS = ['#FFFFFF', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#30B0C7', '#007AFF', '#AF52DE'];
const THICKNESSES = [3, 6, 10, 15];
const BACKGROUND_COLOR = '#111317';
const ERASER_COLOR = BACKGROUND_COLOR;

// --- Type Definitions ---
interface PathData {
  id?: number; // Messages from server will have an ID
  clientId?: number; // Temporary ID for local optimistic updates
  path: string;
  color: string;
  thickness: number;
}
interface NetworkStats {
  rtt: number;
  jitter: number;
  packetsSent: number;
  packetsReceived: number;
  bytesReceived: number;
  pollState: 'ACTIVE' | 'IDLE' | 'ERROR';
}

const StatItem = ({ label, value, unit }: { label: string, value: string | number, unit: string }) => (
  <View style={styles.statItem}>
    <Text style={styles.statLabel}>{label}</Text>
    <View style={styles.statValueContainer}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
    </View>
  </View>
);

// --- Main App Component ---
export default function WhiteboardScreen() {
  const [room, setRoom] = useState<string>('');
  const [connected, setConnected] = useState<boolean>(false);
  const [paths, setPaths] = useState<PathData[]>([]);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  
  const [currentColor, setCurrentColor] = useState<string>('#FFFFFF');
  const [currentThickness, setCurrentThickness] = useState<number>(3);

  const [stats, setStats] = useState<NetworkStats>({
    rtt: 0, jitter: 0, packetsSent: 0, packetsReceived: 0,
    bytesReceived: 0, pollState: 'IDLE'
  });
  
  const lastMessageId = useRef<number>(0);
  const isPolling = useRef<boolean>(false);
  const rttBuffer = useRef<number[]>([]);

  const startPolling = async () => {
    if (isPolling.current || !connected) return;
    isPolling.current = true;
    let localLastId = lastMessageId.current;

    while (isPolling.current) {
      try {
        const pollStartTime = Date.now();
        setStats(prev => ({ ...prev, pollState: 'ACTIVE' }));
        const response = await fetch(`${SERVER_URL}/api/poll/${room}/${localLastId}`);
        
        const rtt = Date.now() - pollStartTime;
        rttBuffer.current.push(rtt);
        if (rttBuffer.current.length > 10) rttBuffer.current.shift();
        
        const avgRtt = rttBuffer.current.reduce((a, b) => a + b, 0) / rttBuffer.current.length;
        const jitter = rttBuffer.current.length > 1 ? Math.max(...rttBuffer.current) - Math.min(...rttBuffer.current) : 0;

        if (!response.ok) {
          setStats(prev => ({ ...prev, pollState: 'ERROR' }));
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        const data = await response.json();
        setStats(prev => ({ ...prev, pollState: 'IDLE', rtt: avgRtt, jitter }));

        if (data.status === 'new_messages' && data.messages.length > 0) {
          const newMessages: PathData[] = data.messages;
          const bytes = JSON.stringify(newMessages).length;

          setPaths((prevPaths) => {
            const latestServerId = newMessages[newMessages.length - 1].id!;
            const serverPathStrings = new Set(newMessages.map(p => `${p.path}-${p.color}-${p.thickness}`));
            
            const filteredOldPaths = prevPaths.filter(p => 
              !p.clientId || !serverPathStrings.has(`${p.path}-${p.color}-${p.thickness}`)
            );
            return [...filteredOldPaths, ...newMessages];
          });
          
          setStats(prev => ({
              ...prev,
              packetsReceived: prev.packetsReceived + newMessages.length,
              bytesReceived: prev.bytesReceived + bytes
          }));
          localLastId = data.messages[data.messages.length - 1].id;
        }
      } catch (error) {
        console.error("Poll error:", error);
        setStats(prev => ({ ...prev, pollState: 'ERROR' }));
        if(isPolling.current) await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  };

  useEffect(() => {
    if (connected && room) {
      startPolling();
    } else {
      isPolling.current = false;
    }
    return () => { isPolling.current = false; };
  }, [connected, room]);


  const connectToRoom = () => {
    if (!room.trim()) {
      Alert.alert('Error', 'Please enter a room name.');
      return;
    }
    setConnected(true);
    setPaths([]);
    lastMessageId.current = 0;
  };

  const handleUndo = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPaths(prev => prev.slice(0, -1));
  };
  
  const handleTouchStart = () => {
    // This correctly starts a new, separate line every time.
    setCurrentPath([]);
  };

  const onTouchMove = (event: GestureResponderEvent) => {
    if (!connected) return;
    const { locationX, locationY } = event.nativeEvent;
    const newPoint = `${locationX.toFixed(0)},${locationY.toFixed(0)}`;
    setCurrentPath((prevPath) => [...prevPath, newPoint]);
  };

  const onTouchEnd = async () => {
    if (!connected || currentPath.length === 0) return;
    
    // For a single tap (a dot), make it a tiny line so it's visible
    const isDot = currentPath.length === 1;
    const finalPath = isDot ? `${currentPath[0]} ${currentPath[0]}` : currentPath.join(' ');

    const pathData = {
      clientId: Date.now(), // Add the temporary client ID
      path: finalPath,
      color: currentColor,
      thickness: currentThickness,
    };

    // Optimistic Update: Draw locally immediately for a smooth experience
    setPaths((prevPaths) => [...prevPaths, pathData]);
    setCurrentPath([]);
    
    setStats(prev => ({ ...prev, packetsSent: prev.packetsSent + 1 }));

    try {
      await fetch(`${SERVER_URL}/api/draw/${room}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pathData), // The clientId is not needed by the server
      });
    } catch (error) {
      console.error("Failed to send draw data:", error);
    }
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      {!connected ? (
        <View style={styles.connectionView}>
          <Text style={styles.title}>CEREBRUS PROTOCOL</Text>
          <TextInput style={styles.input} placeholder="Enter Connection ID" placeholderTextColor="#555" value={room} onChangeText={setRoom} />
          <TouchableOpacity style={styles.button} onPress={connectToRoom}><Text style={styles.buttonText}>Establish Link</Text></TouchableOpacity>
        </View>
      ) : (
        <>
          <View onTouchStart={handleTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} style={styles.whiteboardContainer}>
            <Svg height="100%" width="100%">
              {paths.map((p, index) => (
                <Path key={p.clientId || p.id || index} d={`M ${p.path}`} stroke={p.color} strokeWidth={p.thickness} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {currentPath.length > 0 && (
                <Path d={`M ${currentPath.join(' ')}`} stroke={currentColor} strokeWidth={currentThickness} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </Svg>
          </View>
          <View style={styles.toolbar}>
            <TouchableOpacity onPress={handleUndo} style={styles.toolButton}>
              <Ionicons name="arrow-undo" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setCurrentColor(ERASER_COLOR)}} style={[styles.toolButton, currentColor === ERASER_COLOR && styles.selectedTool]}>
              <Ionicons name="trash-outline" size={24} color="white" />
            </TouchableOpacity>
            <View style={styles.thicknessContainer}>
              {THICKNESSES.map(t => (
                <TouchableOpacity key={t} onPress={() => {Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCurrentThickness(t)}} style={styles.thicknessButton}>
                  <View style={{ width: t + 4, height: t + 4, borderRadius: (t + 4) / 2, backgroundColor: currentThickness === t ? '#007AFF' : 'white' }} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.colorPalette}>
            {COLORS.map(c => (
              <TouchableOpacity key={c} onPress={() => {Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCurrentColor(c)}} style={[styles.colorButton, { backgroundColor: c }, currentColor === c && styles.selectedColor]} />
            ))}
          </View>
          <View style={styles.statsView}>
            <Text style={styles.statsTitle}>[ LIVE DATA STREAM ]</Text>
            <ScrollView>
              <StatItem label="CONNECTION ID" value={room} unit="" />
              <StatItem label="POLL STATE" value={stats.pollState} unit="" />
              <StatItem label="SIMULATED RTT" value={stats.rtt.toFixed(0)} unit="ms" />
              <StatItem label="RTT JITTER" value={stats.jitter.toFixed(0)} unit="ms" />
              <StatItem label="PACKETS SENT (TX)" value={stats.packetsSent} unit="pkts" />
              <StatItem label="PACKETS RECEIVED (RX)" value={stats.packetsReceived} unit="pkts" />
              <StatItem label="GOODPUT (RX)" value={(stats.bytesReceived / 1024).toFixed(2)} unit="KB" />
              <Text style={{fontFamily: 'monospace', fontSize: 16, color: '#FFFFFF', fontWeight: 'bold' }}>
                         Made By Gaurish Todi, 23BCI0262
              </Text>
            </ScrollView>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0F13' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#00C7BE', textAlign: 'center', marginVertical: 20, fontFamily: 'monospace' },
  connectionView: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  input: {
    width: '100%', height: 50, backgroundColor: '#1D1F23', borderRadius: 5,
    paddingHorizontal: 15, color: '#FFFFFF', fontSize: 16, fontFamily: 'monospace',
    marginBottom: 20, borderWidth: 1, borderColor: '#333'
  },
  button: {
    backgroundColor: '#007AFF', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 5,
  },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  whiteboardContainer: { flex: 0.5, backgroundColor: BACKGROUND_COLOR, borderRadius: 10, marginHorizontal: 10, borderWidth: 1, borderColor: '#333' },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 10,
  },
  toolButton: { padding: 8, borderRadius: 5, backgroundColor: '#1D1F23' },
  selectedTool: { backgroundColor: '#007AFF' },
  thicknessContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1D1F23', padding: 5, borderRadius: 5 },
  thicknessButton: { marginHorizontal: 8, padding: 2, alignItems: 'center', justifyContent: 'center' },
  colorPalette: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 10, paddingBottom: 10 },
  colorButton: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  selectedColor: { borderColor: '#FFFFFF' },
  statsView: {
    flex: 0.45, backgroundColor: '#111317', marginTop: 5, marginHorizontal: 10,
    borderRadius: 10, padding: 15, borderWidth: 1, borderColor: '#333',
  },
  statsTitle: {
    fontFamily: 'monospace', fontSize: 18, fontWeight: 'bold', color: '#34C759',
    marginBottom: 10, textAlign: 'center', textShadowColor: 'rgba(52, 199, 89, 0.5)', textShadowRadius: 10
  },
  statItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statLabel: { fontFamily: 'monospace', fontSize: 14, color: '#888' },
  statValueContainer: { flexDirection: 'row', alignItems: 'baseline' },
  statValue: { fontFamily: 'monospace', fontSize: 16, color: '#FFFFFF', fontWeight: 'bold' },
  statUnit: { fontFamily: 'monospace', fontSize: 12, color: '#888', marginLeft: 4 },
});