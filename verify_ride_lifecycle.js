const { io } = require('socket.io-client');

const BACKEND_URL = 'http://localhost:3001';
const API_URL = `${BACKEND_URL}/api`;

async function main() {
  console.log('=== STARTING SAWAARI E2E RIDE LIFECYCLE TEST ===\n');

  try {
    // 1. Authenticate Passenger
    console.log('1. Authenticating Passenger...');
    const passengerAuthToken = 'mock-token-passenger-9999911111';
    const passRes = await fetch(`${API_URL}/auth/register-or-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${passengerAuthToken}` },
      body: JSON.stringify({ role: 'passenger', name: 'Test Passenger E2E' }),
    });
    if (!passRes.ok) throw new Error(`Passenger auth failed: ${await passRes.text()}`);
    const passData = await passRes.json();
    const passengerToken = passData.token;
    const passengerUser = passData.user;
    console.log(`Passenger authenticated. ID: ${passengerUser.id}, Phone: ${passengerUser.phone}`);
    console.log(`API response:`, JSON.stringify(passData, null, 2), '\n');

    // 2. Authenticate Driver
    console.log('2. Authenticating Driver...');
    const driverAuthToken = 'mock-token-driver-9999922222';
    const drivRes = await fetch(`${API_URL}/auth/register-or-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${driverAuthToken}` },
      body: JSON.stringify({ role: 'driver', name: 'Test Driver E2E' }),
    });
    if (!drivRes.ok) throw new Error(`Driver auth failed: ${await drivRes.text()}`);
    const drivData = await drivRes.json();
    const driverToken = drivData.token;
    const driverUser = drivData.user;
    console.log(`Driver authenticated. ID: ${driverUser.id}, Phone: ${driverUser.phone}`);
    console.log(`API response:`, JSON.stringify(drivData, null, 2), '\n');

    // 3. Register Driver Profile and documents
    console.log('3. Registering Driver Vehicle Profile...');
    const registerRes = await fetch(`${API_URL}/drivers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${driverToken}` },
      body: JSON.stringify({
        vehicleNo: 'KA-03-E2E-7890',
        vehicleModel: 'Bajaj RE Electric',
        aadhaarNo: '123456789012',
      }),
    });
    const registerText = await registerRes.text();
    if (!registerRes.ok && !registerText.includes('already registered')) {
      throw new Error(`Driver vehicle registration failed: ${registerText}`);
    }
    console.log(`Vehicle registration result: ${registerText.trim() || 'Success'}`);

    console.log('Uploading/approving mock documents...');
    for (const docType of ['license', 'permit', 'registration', 'aadhaar', 'vehicle_photo']) {
      const docRes = await fetch(`${API_URL}/drivers/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${driverToken}` },
        body: JSON.stringify({
          type: docType,
          url: 'https://res.cloudinary.com/demo/image/upload/v1580894568/sample.jpg',
        }),
      });
      const docText = await docRes.text();
      console.log(`Document [${docType}] upload result: ${docText.trim()}`);
    }
    console.log('');

    // 4. Set Driver Status to ONLINE
    console.log('4. Setting Driver status to ONLINE...');
    const statusRes = await fetch(`${API_URL}/drivers/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${driverToken}` },
      body: JSON.stringify({ isOnline: true }),
    });
    if (!statusRes.ok) throw new Error(`Setting online status failed: ${await statusRes.text()}`);
    const statusData = await statusRes.json();
    console.log(`Driver online status response:`, JSON.stringify(statusData, null, 2), '\n');

    // 5. Establish Sockets Connection
    console.log('5. Connecting Sockets to Gateway...');
    const pSock = io(BACKEND_URL, { auth: { token: passengerToken }, query: { token: passengerToken } });
    const dSock = io(BACKEND_URL, { auth: { token: driverToken }, query: { token: driverToken } });

    await new Promise((resolve, reject) => {
      let pConnected = false;
      let dConnected = false;
      const checkResolve = () => {
        if (pConnected && dConnected) {
          console.log('Passenger & Driver socket connections established successfully.');
          resolve();
        }
      };

      pSock.on('connect', () => { pConnected = true; checkResolve(); });
      dSock.on('connect', () => { dConnected = true; checkResolve(); });
      pSock.on('connect_error', reject);
      dSock.on('connect_error', reject);
      setTimeout(() => reject(new Error('Socket connection timed out')), 5000);
    });
    console.log('');

    // 6. Broadcast Driver Coordinates in Redis via Socket
    console.log('6. Broadcasting Driver Live Location (lat: 12.9716, lng: 77.5946)...');
    dSock.emit('driver_location_update', {
      latitude: 12.9716,
      longitude: 77.5946,
      bearing: 0,
    });
    // Wait for Redis GEO update
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Driver location update broadcasted.\n');

    // 7. Request Ride (Passenger)
    console.log('7. Requesting Ride (Passenger)...');
    const rideRequestRes = await fetch(`${API_URL}/rides/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${passengerToken}` },
      body: JSON.stringify({
        pickupLatitude: 12.9716,
        pickupLongitude: 77.5946,
        pickupAddress: 'MG Road Metro Station, Bengaluru',
        dropoffLatitude: 12.9279,
        dropoffLongitude: 77.6271,
        dropoffAddress: 'Koramangala 3rd Block, Bengaluru',
      }),
    });
    if (!rideRequestRes.ok) throw new Error(`Ride request failed: ${await rideRequestRes.text()}`);
    const rideData = await rideRequestRes.json();
    const rideId = rideData.id;
    const rideOtp = rideData.otp;
    console.log(`Ride requested successfully. Ride ID: ${rideId}, OTP: ${rideOtp}`);
    console.log(`API response:`, JSON.stringify(rideData, null, 2), '\n');

    // 8. Capture Ride Offer on Driver Socket and Accept Ride
    console.log('8. Waiting for Ride Offer Dispatch on Driver socket...');
    const incomingOffer = await new Promise((resolve, reject) => {
      dSock.on('ride_offer', (data) => {
        console.log(`Received ride_offer on driver socket!`, JSON.stringify(data, null, 2));
        resolve(data);
      });
      setTimeout(() => reject(new Error('Timed out waiting for ride offer')), 10000);
    });

    console.log('\nAccepting ride offer...');
    const acceptRes = await fetch(`${API_URL}/rides/${rideId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${driverToken}` },
    });
    if (!acceptRes.ok) throw new Error(`Accepting ride offer failed: ${await acceptRes.text()}`);
    const acceptData = await acceptRes.json();
    console.log(`Accept ride API response:`, JSON.stringify(acceptData, null, 2), '\n');

    // 9. Driver Arrived
    console.log('9. Driver Arriving at Pickup Point...');
    const arriveRes = await fetch(`${API_URL}/rides/${rideId}/arrive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${driverToken}` },
    });
    if (!arriveRes.ok) throw new Error(`Driver arrive failed: ${await arriveRes.text()}`);
    const arriveData = await arriveRes.json();
    console.log(`Arrive API response:`, JSON.stringify(arriveData, null, 2), '\n');

    // 10. Verify OTP and Start Ride
    console.log(`10. Verifying Passenger OTP [${rideOtp}] and starting trip...`);
    const startRes = await fetch(`${API_URL}/rides/${rideId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${driverToken}` },
      body: JSON.stringify({ otp: rideOtp }),
    });
    if (!startRes.ok) throw new Error(`Trip start failed: ${await startRes.text()}`);
    const startData = await startRes.json();
    console.log(`Start trip API response:`, JSON.stringify(startData, null, 2), '\n');

    // 11. Complete Trip
    console.log('11. Completing trip...');
    const completeRes = await fetch(`${API_URL}/rides/${rideId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${driverToken}` },
    });
    if (!completeRes.ok) throw new Error(`Trip completion failed: ${await completeRes.text()}`);
    const completeData = await completeRes.json();
    console.log(`Complete trip API response:`, JSON.stringify(completeData, null, 2), '\n');

    console.log('=== E2E RIDE LIFECYCLE COMPLETED SUCCESSFULLY ===');
    pSock.disconnect();
    dSock.disconnect();
    process.exit(0);

  } catch (err) {
    console.error('ERROR during E2E flow execution:', err.message);
    process.exit(1);
  }
}

main();
