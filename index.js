Quiet.setProfilesPrefix("./");
Quiet.setMemoryInitializerPrefix("./");
Quiet.setLibfecPrefix("./");

var PROFILE = 'audible-bad';
var transmit;
let recvBuffer = new Uint8Array(0);

let MY_DEVICE_ID = Math.floor(Math.random() * 2147483647);
console.log("device=",MY_DEVICE_ID)

function concatBuffers(a, b) {
  let tmp = new Uint8Array(a.byteLength + b.byteLength);
  tmp.set(new Uint8Array(a), 0);
  tmp.set(new Uint8Array(b), a.byteLength);
  return tmp.buffer;
}

var quietReady = new Promise((resolve, reject) => {
  Quiet.addReadyCallback(() => {
    transmit = Quiet.transmitter(PROFILE);
    Quiet.receiver(PROFILE, (payload) => {
      recvBuffer = concatBuffers(recvBuffer, payload);
      let dataView = new DataView(recvBuffer);
      //console.log('received data', recvBuffer.byteLength, new Uint8Array(recvBuffer));
      if (dataView.byteLength < 8) {
        //console.log('not enough length');
        return;
      } else {
        let deviceId = dataView.getUint32(0);
        let messageLength = dataView.getUint32(4);
        //console.log('device=',deviceId, 'len', messageLength)
        if (dataView.byteLength < 8 + messageLength) {
          //console.log('not enough message');
          return; // Still waiting for part of the message.
        } else {
          // We have the whole message!
          let message = recvBuffer.slice(8, 8 + messageLength);
          recvBuffer = recvBuffer.slice(8 + messageLength);
          if (deviceId === MY_DEVICE_ID) {
            //console.log("IGNORING SELF MESSAGE");
            return;
          }
          console.log('Message from', deviceId, '-', Quiet.ab2str(message));
          let json = JSON.parse(Quiet.ab2str(message));
          console.log('Received JSON:', json);
          window.dispatchEvent(new CustomEvent('recv', { detail: json }));
        }
      }
    }, (err) => {
      console.error('Failed to create receiver:', err);
    }, (numFails) => {
      console.error('Failed to receive message', numFails);
    });
    resolve();
  }, (err) => {
    console.error('Quiet failed to initialize:', err);
    reject(err);
  });
});

function rawSend(str) {
  return new Promise((resolve) => {
    let dataBuffer = Quiet.str2ab(JSON.stringify(str));
    let array = new Uint8Array(8 + dataBuffer.byteLength);
    let view = new DataView(array.buffer);
    view.setUint32(0, MY_DEVICE_ID);
    view.setUint32(4, dataBuffer.byteLength);
    array.set(new Uint8Array(dataBuffer), 8);
    console.log('Send:', JSON.stringify(str));
    //console.log('transmitting data', array);
    transmit(array, resolve);
  });
}

let origlog = console.log.bind(console);
console.log = function() {
  let p = document.createElement('div');
  p.textContent = Array.prototype.slice.call(arguments).join(' ');
  document.body.appendChild(p);
  origlog(p);
}


class Sensor {
  constructor() {
    this.readyPromise = Promise.resolve();
    addEventListener('recv', (event) => {
      this.readyPromise = this.readyPromise.then(() => {
        this.handleMessage(event.detail);
      });
    });

    this.statusDiv = document.querySelector('#sensorStatus');
  }

  send(data) {
    this.readyPromise = this.readyPromise.then(() => {
      return rawSend(data);
    });
  }

  handleMessage(data) {
    console.log('sensor handleMessage', data);
    if (data.type === 'list-ssids') {
      this.statusDiv.textContent = 'Sending SSID list...';
      this.send({
        type: 'ssids',
        ssids: ['hi', 'ho']
      });
    } else if (data.type === 'setup') {
      this.statusDiv.textContent = 'Received valid password!';
      setTimeout(() => {
        this.send({
          type: 'setup-ok',
          ssid: data.ssid,
        });
      }, 300);
    }
  }
}

class Phone {
  constructor() {
    this.readyPromise = Promise.resolve();
    addEventListener('recv', (event) => {
      this.readyPromise = this.readyPromise.then(() => {
        this.handleMessage(event.detail);
      });
    });

    this.ssidSelect = document.querySelector('#ssids');
    this.statusDiv = document.querySelector('#phoneStatus');
    this.statusDiv.textContent = 'Hold your phone near the sensor, with the volume up.';

    this.ssidSelect.onchange = (event) => {
      if (event.target.value) {
        this.initiateSetup(event.target.value);
      }
    };

    document.querySelector('#requestSsids').onclick = () => {
      this.send({ type: 'list-ssids' });
    };
  }

  send(data) {
    this.readyPromise = this.readyPromise.then(() => {
      return rawSend(data);
    });
  }

  handleMessage(data) {
    console.log('phone handleMessage', data);
    if (data.type === 'ssids') {
      this.statusDiv.textContent = 'Got list of SSIDs. Please select a network.';
      this.populateSsids(data.ssids);
    } else if (data.type === 'setup-ok') {
      this.statusDiv.textContent = 'Connected!';
    }
  }

  initiateSetup(ssid) {
    let password = prompt(`Enter the password for ${ssid}:`);
    if (!password) {
      this.ssidSelect.value = '';
      return;
    }
    this.statusDiv.textContent = 'Sending connection info...';
      this.send({
        type: 'setup',
        ssid: ssid,
        password: password
      });
  }

  populateSsids(ssids) {
    document.documentElement.classList.add('has-ssids');
    let select = document.querySelector('#ssids');
    select.innerHTML = '<option value="">Select a Network</option>';
    ssids.forEach((ssid) => {
      let option = document.createElement('option');
      option.textContent = ssid;
      select.appendChild(option);
    });
  }
}

let domReady = new Promise((resolve) => {
  window.addEventListener('DOMContentLoaded', () => {
    resolve();
  });
});

Promise.all([quietReady, domReady]).then(() => {
  let selector = document.getElementById('selector');
  document.getElementById('asSensor').onclick = () => {
    selector.parentNode.removeChild(selector);
    document.body.classList.add('as-sensor');
    window.sensor = new Sensor();
  };
  document.getElementById('asPhone').onclick = () => {
    selector.parentNode.removeChild(selector);
    document.body.classList.add('as-phone');
    window.phone = new Phone();
  };
});
