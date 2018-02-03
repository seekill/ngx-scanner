import {
    Reader,
    BinaryBitmap,
    HybridBinarizer,
    Result,
    Exception,
    HTMLCanvasElementLuminanceSource,
} from '@barn/zxing';

/**
 * Based on Zxing-typescript BrowserCodeReader
 */
export class BrowserCodeReader {

    private videoElement: HTMLVideoElement;
    private imageElement: HTMLImageElement;
    private canvasElement: HTMLCanvasElement;
    private canvasElementContext: CanvasRenderingContext2D;
    private timeoutHandler: number;
    private stream: MediaStream;
    private videoPlayEndedEventListener: EventListener;
    private videoPlayingEventListener: EventListener;
    private imageLoadedEventListener: EventListener;

    public constructor(private reader: Reader, private timeBetweenScansMillis: number = 500) { }

    public decodeFromInputVideoDevice(callbackFn: (result: Result) => any, deviceId?: string, videoElement?: HTMLVideoElement): void {

        this.reset();

        this.prepareVideoElement(videoElement);

        const video = deviceId === undefined
            ? { facingMode: 'environment' }
            : { deviceId: { exact: deviceId } };

        const constraints: MediaStreamConstraints = { video };

        navigator
            .mediaDevices
            .getUserMedia(constraints)
            .then((stream: MediaStream) => this.getUserMediaCallback(stream, callbackFn));
    }

    private getUserMediaCallback(stream: MediaStream, callbackFn: (result: Result) => any): void {

        this.stream = stream;

        // @NOTE a play request was interrupted by a new loaded request
        // @throws Exception
        this.videoElement.srcObject = stream;

        this.videoPlayingEventListener = () => {
            this.decodeWithDelay(callbackFn);
        };

        this.videoElement.addEventListener('playing', this.videoPlayingEventListener);
        // see if the `play` is not responsible for the error
        this.videoElement.play(); // video is already playing
    }

    private prepareVideoElement(videoElement?: HTMLVideoElement) {
        if (undefined === videoElement) {
            this.videoElement = document.createElement('video');
            this.videoElement.width = 200;
            this.videoElement.height = 200;
        } else {
            this.videoElement = videoElement;
        }
    }

    private decodeWithDelay(callbackFn: (result: Result) => any): void {
        this.timeoutHandler = window.setTimeout(this.decode.bind(this, callbackFn), this.timeBetweenScansMillis);
    }

    private decode(
        callbackFn: (result: Result) => any,
        retryIfNotFound: boolean = true,
        retryIfChecksumOrFormatError: boolean = true,
        once = false
    ): void {

        if (undefined === this.canvasElementContext) {
            this.prepareCaptureCanvas();
        }

        this.canvasElementContext.drawImage(this.videoElement || this.imageElement, 0, 0);

        // @note generates zone.js error when switching cameras
        const luminanceSource = new HTMLCanvasElementLuminanceSource(this.canvasElement);
        const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));

        try {
            const result = this.readerDecode(binaryBitmap);

            callbackFn(result);

            if (!once && !!this.stream) {
                setTimeout(() => this.decodeWithDelay(callbackFn), this.timeBetweenScansMillis);
            }
        } catch (re) {

            console.log(retryIfChecksumOrFormatError, re);

            if (retryIfNotFound && Exception.isOfType(re, Exception.NotFoundException)) {
                console.warn('Not found, trying again...');

                this.decodeWithDelay(callbackFn);
            } else if (
                retryIfChecksumOrFormatError &&
                (
                    Exception.isOfType(re, Exception.ChecksumException) ||
                    Exception.isOfType(re, Exception.FormatException)
                )
            ) {
                console.log('Checksum or format error, trying again...', re);

                this.decodeWithDelay(callbackFn);
            }
        }
    }

    protected readerDecode(binaryBitmap: BinaryBitmap): Result {
        return this.reader.decode(binaryBitmap);
    }

    private prepareCaptureCanvas() {
        const canvasElement = document.createElement('canvas');
        let width, height;

        if (undefined !== this.videoElement) {
            width = this.videoElement.videoWidth;
            height = this.videoElement.videoHeight;
        } else {
            width = this.imageElement.naturalWidth || this.imageElement.width;
            height = this.imageElement.naturalHeight || this.imageElement.height;
        }

        canvasElement.style.width = `${width}px`;
        canvasElement.style.height = `${height}px`;
        canvasElement.width = width;
        canvasElement.height = height;

        this.canvasElement = canvasElement;
        this.canvasElementContext = canvasElement.getContext('2d');
    }

    private stop(): void {

        if (this.timeoutHandler) {
            window.clearTimeout(this.timeoutHandler);
            this.timeoutHandler = null;
        }

        if (this.stream) {
            // @TODO see if the `stop` is not responsible for the cam switch error
            this.stream.getTracks()[0].stop();
            this.stream = null;
        }

    }

    public reset() {

        this.stop();

        if (undefined !== this.videoPlayEndedEventListener && undefined !== this.videoElement) {
            this.videoElement.removeEventListener('ended', this.videoPlayEndedEventListener);
        }

        if (undefined !== this.videoPlayingEventListener && undefined !== this.videoElement) {
            this.videoElement.removeEventListener('playing', this.videoPlayingEventListener);
        }

        if (undefined !== this.videoElement) {
            this.videoElement.srcObject = undefined;
            this.videoElement.removeAttribute('src');
            this.videoElement = undefined;
        }

        if (undefined !== this.videoPlayEndedEventListener && undefined !== this.imageElement) {
            this.imageElement.removeEventListener('load', this.imageLoadedEventListener);
        }

        if (undefined !== this.imageElement) {
            this.imageElement.src = undefined;
            this.imageElement.removeAttribute('src');
            this.imageElement = undefined;
        }

        this.canvasElementContext = undefined;
        this.canvasElement = undefined;
    }
}
