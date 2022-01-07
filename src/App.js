import logo from './logo.svg';
import './App.css';

import {firstValueFrom, timer} from 'rxjs';
import {HEX} from './hex';

function sleep(timeoutMillis) {
    return firstValueFrom(timer(timeoutMillis));
}

const transferSize = 1024;

const Timeout = {
    Quick: 100,
    Normal: 1000,
    Long: 5000
}

function App() {
    function convertAddress(num) {
        const s = '000000000' + num.toString(16);
        return s.substr(s.length - 8);
    }

    // console.log(convertAddress(0x20000))

    async function click(e) {
        e.preventDefault();
        if ('serial' in navigator) {
            try {
                const port = await navigator.serial.requestPort();

                async function cdcReset() {
                    await port.open({baudRate: 1200});
                    await port.close();
                }

                console.log("CDC reset");
                await cdcReset();
                console.log("Reset done, waiting for board");
                await sleep(2500); // sam-ba-flasher's #wait function


                const options = {
                    baudRate: 921600,
                    dataBits: 8,
                    parity: 'none',
                    stopBits: 1,
                    flowControl: 'none',
                    bufferSize: 4096
                };


                await port.open(options);


                const encoder = new TextEncoder();
                const decoder = new TextDecoder();

                const writer = port.writable.getWriter();
                const reader = port.readable.getReader();

                function write(text) {
                    console.log(text);
                    return writer.write(encoder.encode(text));
                }

                const buffer = [];
                let buffer_idx = 0;
                (async function () {
                    let _done = false;
                    while (!_done) {
                        try {
                            const {value, done} = await reader.read();
                            if (value) {
                                buffer.push(decoder.decode(value));
                            }
                            if (done) {
                                reader.releaseLock();
                                _done = true;
                            }
                        } catch (e) {
                            // NOTE THIS IS IMPORTANT
                            // IF WE DON'T CATCH THIS THEN THE RESET COMMAND BREAKS THE UPLOAD!
                            _done = true;
                        }
                    }
                })(); // background call

                async function timedRead(expectedSize, timeoutMillis) {
                    let done = false;
                    let result = "";
                    setTimeout(() => done = true, timeoutMillis);
                    while (!done) {
                        if (buffer_idx < buffer.length) {
                            result += buffer[buffer_idx];
                            buffer_idx++;
                        }
                        if (result.length >= expectedSize) {
                            done = true;
                        }
                        await sleep(1); // tick;
                    }
                    return result;
                }

                async function writeBinary(data) {

                    let dataIndex = 0;
                    do {
                        let chunkSize = data.length - dataIndex;
                        if (chunkSize > transferSize) {
                            chunkSize = transferSize;
                        }
                        let chunk = data.slice(dataIndex, dataIndex + chunkSize);
                        let received = "";
                        await write('S' + convertAddress(0x20005000) + ',' + convertAddress(chunkSize) + '#');
                        await writer.write(chunk);
                        console.log(chunk);
                        await write('Y' + convertAddress(0x20005000) + ',0#');
                        received = await timedRead(3, Timeout.Long);
                        if (received !== "Y\n\r") {
                            console.log(`Upload error 1: ${received}`);
                        }
                        await write('Y' + convertAddress(0x2000 + dataIndex) + ',' + convertAddress(chunkSize) + '#');
                        received = await timedRead(3, Timeout.Long);
                        if (received !== "Y\n\r") {
                            console.log(`Upload error 2: ${received}`);
                        }
                        dataIndex += chunkSize;
                    } while (dataIndex < data.length);
                }

                console.log("Set Binary Mode")
                await write("N#"); // Set binary mode
                if ((await timedRead(2, Timeout.Normal) !== '\n\r')) throw "Binary set error";

                console.log("Reading version");
                await write("V#"); // read version
                console.log(await timedRead(256, Timeout.Quick));

                console.log("erasing");
                await write("X" + convertAddress(0x2000) + "#"); // erase
                if ((await timedRead(3, Timeout.Long) !== 'X\n\r')) throw "Erase error";

                console.log("Begin Upload");
                await writeBinary(HEX); // write

                console.log("Upload done - resetting board")
                await write("W" + convertAddress(0xe000ed0c) + ',' + convertAddress(0x05fa0004) + '#');
                await sleep(500); // wait for port
            } catch (e) {
                console.log(e);
            }
        }
    }

    return (
        <div className="App">
            <header className="App-header">
                <img src={logo} className="App-logo" alt="logo"/>
                <p>
                    Edit <code>src/App.js</code> and save to reload!
                </p>
                <button onClick={click}>
                    Learn React
                </button>
            </header>
        </div>
    );
}

export default App;
