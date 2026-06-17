import React from 'react';
import { Alert, Modal, PanResponder, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CommandButton, SectionHeader, StatusBadge } from '../ui/components';
import { colors, radii, spacing } from '../ui/theme';
import { HouseMapLayout, HouseMapRoom, MappedDevice, RoomType } from '../types/houseMap';
import { SensorItem } from '../types/sensor';

const GRID_ROWS = 5;
const GRID_COLS = 4;
const TILE_SIZE = 82;
const TILE_GAP = 6;
const GRID_WIDTH = GRID_COLS * TILE_SIZE + (GRID_COLS - 1) * TILE_GAP;
const GRID_HEIGHT = GRID_ROWS * TILE_SIZE + (GRID_ROWS - 1) * TILE_GAP;

const roomOptions: Array<{ type: RoomType; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
    { type: 'kitchen', label: 'Kitchen', icon: 'silverware-fork-knife' },
    { type: 'bedroom', label: 'Bedroom', icon: 'bed-king-outline' },
    { type: 'bathroom', label: 'Bathroom', icon: 'shower' },
    { type: 'garage', label: 'Garage', icon: 'garage-variant' },
    { type: 'living_room', label: 'Living', icon: 'sofa-outline' },
    { type: 'main_door', label: 'Main Door', icon: 'door-closed-lock' },
    { type: 'back_door', label: 'Back Door', icon: 'door-closed' },
];

const legacyRoomOptions: Array<{ type: RoomType; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
    { type: 'hallway', label: 'Hallway', icon: 'arrow-expand-horizontal' },
];

const allRoomOptions = [...roomOptions, ...legacyRoomOptions];
const uniqueRoomTypes = new Set<RoomType>(['main_door', 'back_door']);

const devDevices: MappedDevice[] = [
    { id: 'dev-motion-hallway', label: 'Motion Sensor', type: 'motion', status: 'idle', location: 'Hallway' },
    { id: 'dev-smoke-kitchen', label: 'Smoke Sensor', type: 'smoke', status: 'warning', location: 'Kitchen' },
    { id: 'dev-window-1', label: 'Reed Switch', type: 'door', status: 'safe', location: 'Window 1' },
    { id: 'dev-sprinkler', label: 'Dev sprinkler', type: 'sprinkler', status: 'idle', location: 'Kitchen' },
];

const deviceIcons: Record<MappedDevice['type'], keyof typeof MaterialCommunityIcons.glyphMap> = {
    motion: 'motion-sensor',
    gas: 'smoke-detector-alert-outline',
    smoke: 'smoke-detector-outline',
    flame: 'fire-alert',
    door: 'door-open',
    vibration: 'vibrate',
    window_vibration: 'window-open-variant',
    nfc: 'nfc',
    sprinkler: 'sprinkler',
};

const alertStatuses = new Set<MappedDevice['status']>(['triggered', 'warning', 'critical']);

function roomLabel(type: RoomType, count: number) {
    if (type === 'main_door') return 'Main';
    if (type === 'back_door') return 'Back';

    const option = allRoomOptions.find((item) => item.type === type);
    return `${option?.label ?? 'Room'} ${count}`;
}

function roomSpan(room: Pick<HouseMapRoom, 'type' | 'orientation' | 'cols' | 'rows'>) {
    if (room.cols || room.rows) {
        return { cols: room.cols ?? 1, rows: room.rows ?? 1 };
    }
    if (room.type !== 'hallway') {
        return { cols: 1, rows: 1 };
    }

    return room.orientation === 'vertical' ? { cols: 1, rows: 2 } : { cols: 2, rows: 1 };
}

function roomWidth(room: Pick<HouseMapRoom, 'type' | 'orientation' | 'cols' | 'rows'>) {
    return roomSpan(room).cols * TILE_SIZE + (roomSpan(room).cols - 1) * TILE_GAP;
}

function roomHeight(room: Pick<HouseMapRoom, 'type' | 'orientation' | 'cols' | 'rows'>) {
    return roomSpan(room).rows * TILE_SIZE + (roomSpan(room).rows - 1) * TILE_GAP;
}

function mapSensors(sensors?: SensorItem[]): MappedDevice[] {
    const liveDevices = sensors?.map((sensor) => ({
        id: sensor.id,
        label: sensor.label,
        type: sensor.type,
        status: sensor.status,
        location: '',
    })) ?? [];

    return liveDevices.length > 0 ? liveDevices : devDevices;
}

function getRoomDevices(room: HouseMapRoom, devices: MappedDevice[]) {
    return room.deviceIds
        .map((id) => devices.find((device) => device.id === id))
        .filter((device): device is MappedDevice => !!device);
}

function overlaps(a: HouseMapRoom, b: HouseMapRoom) {
    const aSpan = roomSpan(a);
    const bSpan = roomSpan(b);

    return (
        a.col < b.col + bSpan.cols &&
        a.col + aSpan.cols > b.col &&
        a.row < b.row + bSpan.rows &&
        a.row + aSpan.rows > b.row
    );
}

function fitsGrid(room: HouseMapRoom) {
    const span = roomSpan(room);
    return room.col >= 0 && room.row >= 0 && room.col + span.cols <= GRID_COLS && room.row + span.rows <= GRID_ROWS;
}

function occupiedCells(layout: HouseMapLayout) {
    const cells = new Set<string>();

    layout.rooms.forEach((room) => {
        const span = roomSpan(room);
        for (let row = room.row; row < room.row + span.rows; row += 1) {
            for (let col = room.col; col < room.col + span.cols; col += 1) {
                cells.add(`${row}:${col}`);
            }
        }
    });

    return cells;
}

function emptyCellRects(layout: HouseMapLayout) {
    const occupied = occupiedCells(layout);
    const visited = new Set<string>();
    const rects: Array<{ row: number; col: number; rows: number; cols: number }> = [];

    for (let row = 0; row < GRID_ROWS; row += 1) {
        for (let col = 0; col < GRID_COLS; col += 1) {
            const key = `${row}:${col}`;
            if (occupied.has(key) || visited.has(key)) continue;

            let cols = 1;
            while (col + cols < GRID_COLS && !occupied.has(`${row}:${col + cols}`) && !visited.has(`${row}:${col + cols}`)) {
                cols += 1;
            }

            let rows = 1;
            let canGrow = true;
            while (row + rows < GRID_ROWS && canGrow) {
                for (let nextCol = col; nextCol < col + cols; nextCol += 1) {
                    if (occupied.has(`${row + rows}:${nextCol}`) || visited.has(`${row + rows}:${nextCol}`)) {
                        canGrow = false;
                        break;
                    }
                }
                if (canGrow) rows += 1;
            }

            for (let rectRow = row; rectRow < row + rows; rectRow += 1) {
                for (let rectCol = col; rectCol < col + cols; rectCol += 1) {
                    visited.add(`${rectRow}:${rectCol}`);
                }
            }

            rects.push({ row, col, rows, cols });
        }
    }

    return rects;
}

function WallOverlay({ layout }: { layout: HouseMapLayout }) {
    const cells = occupiedCells(layout);
    const walls: React.ReactNode[] = [];
    const dividerColor = `${colors.muted}88`;
    const dividerThickness = 2;

    for (let row = 0; row < GRID_ROWS; row += 1) {
        const cols = Array.from({ length: GRID_COLS }, (_, col) => col).filter((col) => cells.has(`${row}:${col}`));

        for (let index = 0; index < cols.length - 1; index += 1) {
            const leftCol = cols[index];
            const rightCol = cols[index + 1];
            const gap = rightCol - leftCol - 1;

            if (gap === 0) {
                const left = leftCol * (TILE_SIZE + TILE_GAP) + TILE_SIZE + TILE_GAP / 2 - dividerThickness / 2;
                const top = row * (TILE_SIZE + TILE_GAP) + 10;
                walls.push(
                    <View
                        key={`row-${row}-${leftCol}-${rightCol}-divider`}
                        style={{ position: 'absolute', left, top, width: dividerThickness, height: TILE_SIZE - 20, backgroundColor: dividerColor, borderRadius: 2 }}
                    />
                );
            }
        }
    }

    for (let col = 0; col < GRID_COLS; col += 1) {
        const rows = Array.from({ length: GRID_ROWS }, (_, row) => row).filter((row) => cells.has(`${row}:${col}`));

        for (let index = 0; index < rows.length - 1; index += 1) {
            const topRow = rows[index];
            const bottomRow = rows[index + 1];
            const gap = bottomRow - topRow - 1;

            if (gap === 0) {
                const left = col * (TILE_SIZE + TILE_GAP) + 10;
                const top = topRow * (TILE_SIZE + TILE_GAP) + TILE_SIZE + TILE_GAP / 2 - dividerThickness / 2;
                walls.push(
                    <View
                        key={`col-${col}-${topRow}-${bottomRow}-divider`}
                        style={{ position: 'absolute', left, top, width: TILE_SIZE - 20, height: dividerThickness, backgroundColor: dividerColor, borderRadius: 2 }}
                    />
                );
            }
        }
    }

    return <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>{walls}</View>;
}

function ScrollFade({ side }: { side: 'left' | 'right' }) {
    const leftStrips = [0.96, 0.86, 0.74, 0.6, 0.46, 0.34, 0.23, 0.14, 0.07, 0.02];
    const strips = side === 'left' ? leftStrips : [...leftStrips].reverse();

    return (
        <View
            pointerEvents="none"
            style={{
                position: 'absolute',
                left: side === 'left' ? 0 : undefined,
                right: side === 'right' ? 0 : undefined,
                top: 0,
                bottom: 0,
                width: 46,
                flexDirection: 'row',
            }}
        >
            {strips.map((opacity, index) => (
                <View key={index} style={{ flex: 1, backgroundColor: colors.background, opacity }} />
            ))}
        </View>
    );
}

function RoomTile({
    room,
    devices,
    editable,
    onLongPress,
    onPress,
    onMoveEnd,
    onResizeEnd,
    selected,
}: {
    room: HouseMapRoom;
    devices: MappedDevice[];
    editable: boolean;
    onLongPress: () => void;
    onPress?: () => void;
    onMoveEnd?: (room: HouseMapRoom, row: number, col: number) => void;
    onResizeEnd?: (room: HouseMapRoom, cols: number, rows: number) => void;
    selected?: boolean;
}) {
    const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
    const [resizeOffset, setResizeOffset] = React.useState({ x: 0, y: 0 });
    const dragStartTouchRef = React.useRef({ x: 0, y: 0 });
    const dragStartOffsetRef = React.useRef({ x: 0, y: 0 });
    const latestDragOffsetRef = React.useRef({ x: 0, y: 0 });
    const movedRef = React.useRef(false);
    const longPressedRef = React.useRef(false);
    const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const resizingRef = React.useRef(false);
    const roomRef = React.useRef(room);
    const onLongPressRef = React.useRef(onLongPress);
    const onPressRef = React.useRef(onPress);
    const onMoveEndRef = React.useRef(onMoveEnd);
    const onResizeEndRef = React.useRef(onResizeEnd);
    const active = devices.some((device) => alertStatuses.has(device.status));
    const option = allRoomOptions.find((item) => item.type === room.type);
    const iconColor = active ? colors.critical : colors.primary;
    const span = roomSpan(room);
    const singleCell = span.cols === 1 && span.rows === 1;
    const oneRow = span.rows === 1;
    const maxVisibleDevices = singleCell ? 1 : Math.min(devices.length, Math.max(2, span.cols * span.rows * 2));
    const visibleDevices = devices.slice(0, maxVisibleDevices);
    const overflowDevices = Math.max(0, devices.length - visibleDevices.length);
    const dragging = dragOffset.x !== 0 || dragOffset.y !== 0;
    const resizing = resizeOffset.x !== 0 || resizeOffset.y !== 0;
    const liveWidth = Math.max(TILE_SIZE, roomWidth(room) + resizeOffset.x);
    const liveHeight = Math.max(TILE_SIZE, roomHeight(room) + resizeOffset.y);
    const iconSize = Math.max(20, Math.min(34, 20 + (span.cols + span.rows - 2) * 4));
    const labelSize = Math.max(11, Math.min(17, 11 + span.cols + span.rows));
    const resizeCornerSize = 34;

    React.useEffect(() => {
        roomRef.current = room;
        onLongPressRef.current = onLongPress;
        onPressRef.current = onPress;
        onMoveEndRef.current = onMoveEnd;
        onResizeEndRef.current = onResizeEnd;
    }, [onLongPress, onMoveEnd, onPress, onResizeEnd, room]);

    const resizeResponder = React.useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: () => editable,
                onMoveShouldSetPanResponder: () => editable,
                onPanResponderGrant: () => {
                    resizingRef.current = true;
                    if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                    }
                },
                onPanResponderMove: (_, gesture) => {
                    setResizeOffset({ x: gesture.dx, y: gesture.dy });
                },
                onPanResponderRelease: (_, gesture) => {
                    resizingRef.current = false;
                    setResizeOffset({ x: 0, y: 0 });
                    const span = roomSpan(roomRef.current);
                    const nextCols = Math.max(1, Math.min(GRID_COLS, Math.round(span.cols + gesture.dx / (TILE_SIZE + TILE_GAP))));
                    const nextRows = Math.max(1, Math.min(GRID_ROWS, Math.round(span.rows + gesture.dy / (TILE_SIZE + TILE_GAP))));
                    onResizeEndRef.current?.(roomRef.current, nextCols, nextRows);
                },
                onPanResponderTerminate: () => {
                    resizingRef.current = false;
                    setResizeOffset({ x: 0, y: 0 });
                },
                onPanResponderTerminationRequest: () => false,
            }),
        [editable]
    );

    const panResponder = React.useMemo(
        () =>
            PanResponder.create({
                onStartShouldSetPanResponder: (event) => {
                    if (!editable) return false;
                    return !(event.nativeEvent.locationX >= liveWidth - resizeCornerSize && event.nativeEvent.locationY >= liveHeight - resizeCornerSize);
                },
                onMoveShouldSetPanResponder: (event) => {
                    if (!editable) return false;
                    return !(event.nativeEvent.locationX >= liveWidth - resizeCornerSize && event.nativeEvent.locationY >= liveHeight - resizeCornerSize);
                },
                onPanResponderGrant: (event) => {
                    if (resizingRef.current) return;
                    movedRef.current = false;
                    longPressedRef.current = false;
                    dragStartTouchRef.current = {
                        x: event.nativeEvent.pageX,
                        y: event.nativeEvent.pageY,
                    };
                    dragStartOffsetRef.current = { x: 0, y: 0 };
                    longPressTimerRef.current = setTimeout(() => {
                        longPressedRef.current = true;
                    }, 360);
                },
                onPanResponderMove: (event) => {
                    if (resizingRef.current) return;
                    const dx = event.nativeEvent.pageX - dragStartTouchRef.current.x;
                    const dy = event.nativeEvent.pageY - dragStartTouchRef.current.y;
                    if (Math.abs(dx) + Math.abs(dy) > 4) {
                        movedRef.current = true;
                        if (longPressTimerRef.current) {
                            clearTimeout(longPressTimerRef.current);
                            longPressTimerRef.current = null;
                        }
                    }
                    const nextOffset = {
                        x: dragStartOffsetRef.current.x + dx,
                        y: dragStartOffsetRef.current.y + dy,
                    };
                    latestDragOffsetRef.current = nextOffset;
                    setDragOffset(nextOffset);
                },
                onPanResponderRelease: (event) => {
                    if (resizingRef.current) return;
                    if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                    }
                    const dx = event.nativeEvent.pageX - dragStartTouchRef.current.x;
                    const dy = event.nativeEvent.pageY - dragStartTouchRef.current.y;
                    const finalOffset = {
                        x: dragStartOffsetRef.current.x + dx,
                        y: dragStartOffsetRef.current.y + dy,
                    };
                    const currentRoom = roomRef.current;
                    dragStartOffsetRef.current = { x: 0, y: 0 };
                    latestDragOffsetRef.current = { x: 0, y: 0 };
                    setDragOffset({ x: 0, y: 0 });
                    const nextCol = Math.round(currentRoom.col + finalOffset.x / (TILE_SIZE + TILE_GAP));
                    const nextRow = Math.round(currentRoom.row + finalOffset.y / (TILE_SIZE + TILE_GAP));
                    if (nextCol !== currentRoom.col || nextRow !== currentRoom.row) {
                        onMoveEndRef.current?.(currentRoom, nextRow, nextCol);
                    } else if (!movedRef.current && !longPressedRef.current) {
                        onPressRef.current?.();
                    }
                },
                onPanResponderTerminate: () => {
                    if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                    }
                    dragStartOffsetRef.current = { x: 0, y: 0 };
                    latestDragOffsetRef.current = { x: 0, y: 0 };
                    setDragOffset({ x: 0, y: 0 });
                },
                onPanResponderTerminationRequest: () => false,
                onShouldBlockNativeResponder: () => true,
            }),
        [editable, liveHeight, liveWidth]
    );

    React.useEffect(() => {
        return () => {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
            }
        };
    }, []);

    const tileStyle = {
        position: 'absolute' as const,
        left: room.col * (TILE_SIZE + TILE_GAP) + dragOffset.x,
        top: room.row * (TILE_SIZE + TILE_GAP) + dragOffset.y,
        width: liveWidth,
        height: liveHeight,
        borderRadius: 3,
        borderWidth: dragging || resizing || active || selected ? 2 : 1,
        borderColor: dragging || resizing ? colors.primary : active ? colors.critical : selected ? colors.primary : `${colors.muted}CC`,
        backgroundColor: active ? '#183047' : '#071B34',
        padding: 8,
        overflow: 'hidden' as const,
        zIndex: dragOffset.x || dragOffset.y ? 20 : 2,
    };

    const tileContent = (
        <>
            {devices.length > 0 && (
                <View style={{ position: 'absolute', right: 6, top: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: active ? colors.critical : colors.success }} />
            )}

            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingRight: oneRow && !singleCell && devices.length > 0 ? 44 : 0 }}>
                <MaterialCommunityIcons name={option?.icon ?? 'home-outline'} size={iconSize} color={iconColor} />
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ color: colors.text, fontSize: labelSize, fontWeight: '800', textAlign: 'center', maxWidth: '94%' }}>
                    {room.label}
                </Text>
                {!oneRow && devices.length > 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 4, maxWidth: '92%' }}>
                        {visibleDevices.map((device) => {
                            const alerting = alertStatuses.has(device.status);
                            return (
                                <View
                                    key={device.id}
                                    style={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: 10,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderWidth: 1,
                                        borderColor: alerting ? colors.critical : '#1B2B42',
                                        backgroundColor: alerting ? colors.critical : '#030A16',
                                    }}
                                >
                                    <MaterialCommunityIcons name={deviceIcons[device.type]} size={12} color={colors.text} />
                                </View>
                            );
                        })}
                        {overflowDevices > 0 && <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '900' }}>+{overflowDevices}</Text>}
                    </View>
                )}
            </View>

            {oneRow && devices.length > 0 && (
                <View style={{ position: 'absolute', left: singleCell ? 6 : undefined, right: singleCell ? undefined : 8, top: singleCell ? 6 : 24, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    {visibleDevices.map((device) => {
                        const alerting = alertStatuses.has(device.status);
                        return (
                            <View
                                key={device.id}
                                style={{
                                    width: 19,
                                    height: 19,
                                    borderRadius: 10,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderWidth: 1,
                                    borderColor: alerting ? colors.critical : '#1B2B42',
                                    backgroundColor: alerting ? colors.critical : '#030A16',
                                }}
                            >
                                <MaterialCommunityIcons name={deviceIcons[device.type]} size={11} color={colors.text} />
                            </View>
                        );
                    })}
                    {overflowDevices > 0 && <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '900' }}>+{overflowDevices}</Text>}
                </View>
            )}

            {editable && (
                <View
                    {...resizeResponder.panHandlers}
                    style={{
                        position: 'absolute',
                        right: 0,
                        bottom: 0,
                        width: resizeCornerSize,
                        height: resizeCornerSize,
                        borderRightWidth: 3,
                        borderBottomWidth: 3,
                        borderColor: colors.primary,
                        borderBottomRightRadius: 3,
                        zIndex: 50,
                    }}
                />
            )}
        </>
    );

    if (!editable) {
        if (!onPress) {
            return <View style={tileStyle}>{tileContent}</View>;
        }

        return (
            <Pressable onPress={onPressRef.current} style={tileStyle}>
                {tileContent}
            </Pressable>
        );
    }

    return (
        <View
            {...panResponder.panHandlers}
            style={tileStyle}
        >
            {tileContent}
        </View>
    );
}

export function HouseMapPreview({
    layout,
    sensors,
    onRoomPress,
}: {
    layout: HouseMapLayout;
    sensors?: SensorItem[];
    onRoomPress?: (room: HouseMapRoom, devices: MappedDevice[]) => void;
}) {
    const devices = mapSensors(sensors);
    if (layout.rooms.length === 0) {
        return null;
    }

    return (
        <View style={{ height: GRID_HEIGHT, overflow: 'hidden' }}>
            <View
                style={{
                    alignSelf: 'center',
                    width: GRID_WIDTH,
                    height: GRID_HEIGHT,
                }}
            >
                <BlueprintCanvas
                    layout={layout}
                    devices={devices}
                    editable={false}
                    showGrid
                    onRoomPress={(room) => onRoomPress?.(room, getRoomDevices(room, devices))}
                />
            </View>
        </View>
    );
}

function BlueprintCanvas({
    layout,
    devices,
    editable,
    onRoomLongPress,
    onRoomPress,
    onRoomMoveEnd,
    onRoomResizeEnd,
    onGridPress,
    selectedRoomId,
    showGrid = true,
}: {
    layout: HouseMapLayout;
    devices: MappedDevice[];
    editable: boolean;
    onRoomLongPress?: (room: HouseMapRoom) => void;
    onRoomPress?: (room: HouseMapRoom) => void;
    onRoomMoveEnd?: (room: HouseMapRoom, row: number, col: number) => void;
    onRoomResizeEnd?: (room: HouseMapRoom, cols: number, rows: number) => void;
    onGridPress?: (row: number, col: number) => void;
    selectedRoomId?: string | null;
    showGrid?: boolean;
}) {
    const emptyRects = editable
        ? Array.from({ length: GRID_ROWS * GRID_COLS }).map((_, index) => ({
            row: Math.floor(index / GRID_COLS),
            col: index % GRID_COLS,
            rows: 1,
            cols: 1,
        }))
        : emptyCellRects(layout);

    return (
        <View
            style={{
                alignSelf: 'center',
                width: GRID_WIDTH,
                height: GRID_HEIGHT,
            }}
        >
                {emptyRects.map((rect) => (
                    <View
                        key={`empty-${rect.row}-${rect.col}`}
                        style={{
                            position: 'absolute',
                            left: rect.col * (TILE_SIZE + TILE_GAP),
                            top: rect.row * (TILE_SIZE + TILE_GAP),
                            width: rect.cols * TILE_SIZE + (rect.cols - 1) * TILE_GAP,
                            height: rect.rows * TILE_SIZE + (rect.rows - 1) * TILE_GAP,
                            borderRadius: 3,
                            borderWidth: showGrid ? 1 : 0,
                            borderColor: showGrid ? `${colors.muted}AA` : 'transparent',
                            backgroundColor: '#071B34',
                        }}
                    />
                ))}
                {editable && onGridPress && Array.from({ length: GRID_ROWS * GRID_COLS }).map((_, index) => {
                    const row = Math.floor(index / GRID_COLS);
                    const col = index % GRID_COLS;
                    const occupied = layout.rooms.some((room) => {
                        const span = roomSpan(room);
                        return room.col <= col && col < room.col + span.cols && room.row <= row && row < room.row + span.rows;
                    });

                    if (occupied) {
                        return null;
                    }

                    return (
                        <Pressable
                            key={`drop-${index}`}
                            onPress={() => onGridPress(row, col)}
                            style={{
                                position: 'absolute',
                                left: col * (TILE_SIZE + TILE_GAP),
                                top: row * (TILE_SIZE + TILE_GAP),
                                width: TILE_SIZE,
                                height: TILE_SIZE,
                                zIndex: 1,
                            }}
                        />
                    );
                })}
                {layout.rooms.map((room) => (
                    <RoomTile
                        key={room.id}
                        room={room}
                        devices={getRoomDevices(room, devices)}
                        editable={editable}
                        onLongPress={() => onRoomLongPress?.(room)}
                        onPress={() => onRoomPress?.(room)}
                        onMoveEnd={onRoomMoveEnd}
                        onResizeEnd={onRoomResizeEnd}
                        selected={selectedRoomId === room.id}
                    />
                ))}
        </View>
    );
}

export function HouseMapEditor({
    visible,
    layout,
    sensors,
    onChange,
    onClose,
}: {
    visible: boolean;
    layout: HouseMapLayout;
    sensors?: SensorItem[];
    onChange: (layout: HouseMapLayout) => void;
    onClose: () => void;
}) {
    const insets = useSafeAreaInsets();
    const devices = mapSensors(sensors);
    const [selectedRoomType, setSelectedRoomType] = React.useState<RoomType>('kitchen');
    const [assigningRoom, setAssigningRoom] = React.useState<HouseMapRoom | null>(null);
    const [renamingRoom, setRenamingRoom] = React.useState<HouseMapRoom | null>(null);
    const [renameValue, setRenameValue] = React.useState('');

    const placeRoom = (row: number, col: number) => {
        const type = selectedRoomType;
        if (type === 'hallway' && col >= GRID_COLS - 1) {
            Alert.alert('Hallway needs space', 'Place hallway blocks where two side-by-side cells are free.');
            return;
        }
        if (uniqueRoomTypes.has(type) && layout.rooms.some((room) => room.type === type)) {
            const label = type === 'main_door' ? 'main door' : 'back door';
            Alert.alert('Door already placed', `There can only be one ${label} on the map.`);
            return;
        }

        const sameTypeCount = layout.rooms.filter((room) => room.type === type).length + 1;
        const room: HouseMapRoom = {
            id: `${type}-${Date.now()}`,
            type,
            label: roomLabel(type, sameTypeCount),
            row,
            col,
            orientation: 'horizontal',
            deviceIds: [],
        };

        if (!fitsGrid(room) || layout.rooms.some((existing) => overlaps(existing, room))) {
            return;
        }

        onChange({ ...layout, promptState: 'accepted', rooms: [...layout.rooms, room] });
    };

    const updateRoom = (roomId: string, updater: (room: HouseMapRoom) => HouseMapRoom) => {
        onChange({
            ...layout,
            promptState: 'accepted',
            rooms: layout.rooms.map((room) => (room.id === roomId ? updater(room) : room)),
        });
    };

    const removeRoom = (roomId: string) => {
        onChange({ ...layout, promptState: 'accepted', rooms: layout.rooms.filter((room) => room.id !== roomId) });
    };

    const moveRoom = (room: HouseMapRoom, row: number, col: number) => {
        const movedRoom = { ...room, row, col };
        const otherRooms = layout.rooms.filter((item) => item.id !== room.id);

        if (!fitsGrid(movedRoom) || otherRooms.some((existing) => overlaps(existing, movedRoom))) {
            return;
        }

        onChange({ ...layout, promptState: 'accepted', rooms: layout.rooms.map((item) => (item.id === room.id ? movedRoom : item)) });
    };

    const rotateHallway = (room: HouseMapRoom) => {
        const rotatedRoom: HouseMapRoom = {
            ...room,
            orientation: room.orientation === 'vertical' ? 'horizontal' : 'vertical',
        };
        const otherRooms = layout.rooms.filter((item) => item.id !== room.id);

        if (!fitsGrid(rotatedRoom) || otherRooms.some((existing) => overlaps(existing, rotatedRoom))) {
            Alert.alert('No room to rotate', 'Move the hallway to a clearer spot first.');
            return;
        }

        onChange({ ...layout, promptState: 'accepted', rooms: layout.rooms.map((item) => (item.id === room.id ? rotatedRoom : item)) });
    };

    const handleGridPress = (row: number, col: number) => {
        placeRoom(row, col);
    };

    const resizeRoom = (room: HouseMapRoom, cols: number, rows: number) => {
        const resizedRoom = { ...room, cols, rows };
        const otherRooms = layout.rooms.filter((item) => item.id !== room.id);

        if (!fitsGrid(resizedRoom) || otherRooms.some((existing) => overlaps(existing, resizedRoom))) {
            return;
        }

        onChange({ ...layout, promptState: 'accepted', rooms: layout.rooms.map((item) => (item.id === room.id ? resizedRoom : item)) });
    };

    const showRoomActions = (room: HouseMapRoom) => {
        const actions = [
            { text: 'Sensors', onPress: () => setAssigningRoom(room) },
            {
                text: 'Rename',
                onPress: () => {
                    setRenameValue(room.label);
                    setRenamingRoom(room);
                },
            },
            { text: 'Delete room', style: 'destructive', onPress: () => removeRoom(room.id) },
            { text: 'Cancel', style: 'cancel' },
        ] as Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }>;

        if (room.deviceIds.length > 0) {
            actions.splice(1, 0, { text: 'Remove sensors', onPress: () => updateRoom(room.id, (current) => ({ ...current, deviceIds: [] })) });
        }
        if (room.type === 'hallway') {
            actions.splice(1, 0, { text: 'Rotate', onPress: () => rotateHallway(room) });
        }

        Alert.alert(room.label, 'Edit this room or assign connected devices.', actions);
    };

    const toggleDevice = (deviceId: string) => {
        if (!assigningRoom) return;
        const currentRoom = layout.rooms.find((room) => room.id === assigningRoom.id);
        const alreadyAssignedHere = currentRoom?.deviceIds.includes(deviceId);

        onChange({
            ...layout,
            promptState: 'accepted',
            rooms: layout.rooms.map((room) => {
                const withoutDevice = room.deviceIds.filter((id) => id !== deviceId);

                if (room.id !== assigningRoom.id || alreadyAssignedHere) {
                    return { ...room, deviceIds: withoutDevice };
                }

                return { ...room, deviceIds: [...withoutDevice, deviceId] };
            }),
        });
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View
                style={{
                    flex: 1,
                    backgroundColor: colors.background,
                    paddingTop: Math.max(insets.top + 18, 64),
                    paddingBottom: insets.bottom,
                }}
            >
                <View style={{ flex: 1, paddingHorizontal: spacing.page, paddingBottom: Math.max(insets.bottom + 14, 28), gap: 10 }}>
                    <View style={{ gap: 10, marginTop: 14 }}>
                        <SectionHeader icon="floor-plan" title="Edit Home Map" subtitle="Pick a block, tap the grid to add it, then drag blocks into place." />
                    </View>

                    <View style={{ overflow: 'hidden' }}>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 18 }}
                        >
                        <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
                            {roomOptions.map((option) => {
                                const selected = option.type === selectedRoomType;
                                const disabled = uniqueRoomTypes.has(option.type) && layout.rooms.some((room) => room.type === option.type);
                                return (
                                    <Pressable
                                        key={option.type}
                                        disabled={disabled}
                                        onPress={() => setSelectedRoomType(option.type)}
                                        style={{
                                            width: 96,
                                            minHeight: 68,
                                            borderRadius: radii.md,
                                            borderWidth: selected ? 2 : 1,
                                            borderColor: disabled ? colors.border : selected ? colors.primary : colors.border,
                                            backgroundColor: selected ? `${colors.primary}22` : colors.surface,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 6,
                                            opacity: disabled ? 0.45 : 1,
                                        }}
                                    >
                                        <MaterialCommunityIcons name={option.icon} size={22} color={selected ? colors.primary : colors.muted} />
                                        <Text style={{ color: colors.text, fontWeight: '900', fontSize: 12 }}>{option.label}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                        </ScrollView>
                        <ScrollFade side="left" />
                        <ScrollFade side="right" />
                    </View>

                    <View style={{ alignSelf: 'center', marginTop: 6 }}>
                        <View>
                            <BlueprintCanvas
                                layout={layout}
                                devices={devices}
                                editable
                                onRoomLongPress={showRoomActions}
                                onRoomPress={showRoomActions}
                                onRoomMoveEnd={moveRoom}
                                onRoomResizeEnd={resizeRoom}
                                onGridPress={handleGridPress}
                            />
                        </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                        <CommandButton
                            label="Reset"
                            icon="delete-outline"
                            tone="danger"
                            onPress={() =>
                                Alert.alert('Reset home map?', 'This removes all rooms and sensor placements.', [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Reset', style: 'destructive', onPress: () => onChange({ rooms: [], promptState: 'accepted' }) },
                                ])
                            }
                        />
                        <CommandButton label="Done" icon="check" tone="primary" onPress={onClose} />
                    </View>
                </View>

                <Modal visible={!!assigningRoom} transparent animationType="fade" onRequestClose={() => setAssigningRoom(null)}>
                    <View style={{ flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' }}>
                        <Pressable
                            onPress={() => setAssigningRoom(null)}
                            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
                        />
                        <View
                            style={{
                                maxHeight: '72%',
                                backgroundColor: colors.surface,
                                paddingTop: spacing.page,
                                paddingHorizontal: spacing.page,
                                paddingBottom: Math.max(insets.bottom + 24, 36),
                                gap: 12,
                                borderTopLeftRadius: 8,
                                borderTopRightRadius: 8,
                            }}
                        >
                            <SectionHeader icon="radar" title={assigningRoom ? `Sensors for ${assigningRoom.label}` : 'Sensors'} />
                            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 8, paddingBottom: 30 }} showsVerticalScrollIndicator>
                                {devices.map((device) => {
                                    const currentRoom = layout.rooms.find((room) => room.id === assigningRoom?.id);
                                    const selected = currentRoom?.deviceIds.includes(device.id);
                                    const assignedRoom = layout.rooms.find((room) => room.deviceIds.includes(device.id));
                                    const takenByOtherRoom = !!assignedRoom && assignedRoom.id !== assigningRoom?.id;
                                    return (
                                        <Pressable
                                            key={device.id}
                                            onPress={() => toggleDevice(device.id)}
                                            style={{
                                                minHeight: 50,
                                                borderRadius: radii.md,
                                                borderWidth: 1,
                                                borderColor: selected ? colors.primary : colors.border,
                                                backgroundColor: selected ? `${colors.primary}22` : colors.surfaceAlt,
                                                paddingHorizontal: 12,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                gap: 10,
                                            }}
                                        >
                                            <MaterialCommunityIcons name={deviceIcons[device.type]} size={21} color={selected ? colors.primary : colors.text} />
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ color: colors.text, fontWeight: '900' }}>{device.label}</Text>
                                                <Text style={{ color: colors.muted, fontSize: 12 }}>{device.location || 'Unassigned'} - {device.status}</Text>
                                                {takenByOtherRoom && (
                                                    <Text style={{ color: colors.critical, fontSize: 12, fontWeight: '900', marginTop: 2 }}>
                                                        Taken in {assignedRoom.label}
                                                    </Text>
                                                )}
                                            </View>
                                            {selected && <MaterialCommunityIcons name="check-circle" size={22} color={colors.primary} />}
                                            {takenByOtherRoom && <MaterialCommunityIcons name="alert-circle-outline" size={22} color={colors.critical} />}
                                        </Pressable>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>

                <Modal visible={!!renamingRoom} transparent animationType="fade" onRequestClose={() => setRenamingRoom(null)}>
                    <View style={{ flex: 1, backgroundColor: '#00000099', justifyContent: 'center', padding: spacing.page }}>
                        <View style={{ backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.card, gap: 12 }}>
                            <SectionHeader icon="pencil" title="Rename Room" />
                            <TextInput
                                value={renameValue}
                                onChangeText={setRenameValue}
                                placeholder="Room name"
                                placeholderTextColor={colors.muted}
                                style={{
                                    backgroundColor: colors.surfaceAlt,
                                    color: colors.text,
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                    borderRadius: radii.md,
                                    paddingHorizontal: 14,
                                    paddingVertical: 13,
                                    fontWeight: '800',
                                }}
                            />
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <CommandButton label="Cancel" icon="close" onPress={() => setRenamingRoom(null)} />
                                <CommandButton
                                    label="Save"
                                    icon="content-save"
                                    tone="primary"
                                    onPress={() => {
                                        if (renamingRoom && renameValue.trim()) {
                                            updateRoom(renamingRoom.id, (room) => ({ ...room, label: renameValue.trim() }));
                                        }
                                        setRenamingRoom(null);
                                    }}
                                />
                            </View>
                        </View>
                    </View>
                </Modal>
            </View>
        </Modal>
    );
}
