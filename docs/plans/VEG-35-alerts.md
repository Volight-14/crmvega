# VEG-35: Redesign of Alert System (Visual & Sound)

## 1. Overview
The user wants to overhaul the notification system to be less intrusive by default but highly customizable for "owners" of specific stages. The current system relies on "Global" alerts which are too broad.

## 2. Requirements

### 2.1 Settings Page Redesign
- **Email Notifications**: Remove the option (implied cleanup).
- **Control A: "All Notifications" (Renamed from "Deal Updates")**:
  - Behavior: Master toggle. If ON, receive alerts for EVERYTHING.
  - Logic update: Should be mutually exclusive or prioritized vs Control B using "Stages".
- **Control B: "Only My Notifications" (Renamed from "New Messages")**:
  - UI: Multi-select dropdown for Stages/Statuses.
  - Behavior: If specific stages are selected, ONLY receive alerts for deals in these stages.
  - **Priority Logic**:
    - If `Selected Stages` is NOT EMPTY -> Ignore "All Notifications" toggle, use Filter Mode.
    - If `Selected Stages` IS EMPTY -> Fallback to "All Notifications" toggle (if ON -> All, if OFF -> None).

### 2.2 Functional Changes
- **Visual Alert**: Red badge on browser tab (already exists, but check logic).
- **Bell Icon**: Duplicate the "Unread Count" badge onto the Bell icon in the header.
- **Sound Alert**:
  - Play custom sound (or standard beep) when a new message arrives.
  - **Filtering**: Apply the Settings logic (All vs Filtered) before playing sound.
  - **Fix Double Sound**: Investigate why replying to an operator triggers two sounds.

## 3. Implementation Plan

### 3.1 Backend / Socket Payload
**Critical Dependency**: The `new_message_global` socket event MUST include the `status` (stage) of the deal.
- **Action**: Verify `backend/index.js` or `socket.js` to ensure the emitted message object includes `order_status` or `column_id`.

### 3.2 Frontend: SettingsPage.tsx
- Remove "Email" related toggles if present.
- Rename labels as requested.
- Change logic of UI:
  - Allow "Stage Select" to be active even if "All" is active (or just make them work together naturally).
  - Clearer helper text explaining the "Override" behavior.

### 3.3 Frontend: MainLayout.tsx (The Logic Core)
- **Read Settings**: On `new_message_global` event, read `localStorage` for `crm_notification_settings_{id}`.
- **Filter Logic**:
  ```javascript
  const { all_active, statuses } = settings;
  const msgStatus = msg.status_id; // Need to ensure this exists

  let shouldNotify = false;

  if (statuses && statuses.length > 0) {
      // "Only My Notifications" mode
      if (statuses.includes(msgStatus)) shouldNotify = true;
  } else {
      // "All Notifications" mode
      if (all_active) shouldNotify = true;
  }
  ```
- **Sound Fix**:
  - Add a "debounce" or check for duplicate IDs to prevent double sounds.
  - Verify if `msg.author_type` is 'client' (we usually only want alerts for Client messages, not our own).

### 3.4 Verification
- Test case 1: "All" ON, "Stages" Empty -> Receive all.
- Test case 2: "Stages"=['New'], "All" ON -> Only receive 'New'. "All" is effectively ignored which matches the "override" requirement.

## 4. Expected Files to Change
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/components/MainLayout.tsx`
- `backend/index.js` (potentially, to add status to payload)

