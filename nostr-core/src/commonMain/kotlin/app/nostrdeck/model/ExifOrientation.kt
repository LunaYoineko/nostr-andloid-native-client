package app.nostrdeck.model

/**
 * [#322] 画像を正しい向きで描くための変換。
 *
 * @param rotationDegrees 時計回りの回転角（0/90/180/270）
 * @param mirrored 回転**前**に左右反転するか
 */
data class ImageTransform(val rotationDegrees: Int, val mirrored: Boolean) {
    /** 何もしなくてよい（＝再エンコード時に画素を触る必要が無い）。 */
    val isIdentity: Boolean get() = rotationDegrees == 0 && !mirrored

    /** この変換で幅と高さが入れ替わるか。 */
    val swapsAxes: Boolean get() = rotationDegrees == 90 || rotationDegrees == 270
}

/**
 * EXIF の Orientation タグ(0x0112) の値を、画素に焼き込むべき変換へ。
 *
 * カメラは端末を傾けても**センサーの向きのまま**画素を書き、「表示時にこう直せ」という指示だけを
 * このタグに入れる。ビューアはタグを見て回して表示するので、**画素を再エンコードするときに
 * タグを引き継がない（あるいは引き継げない形式にする）と、その時点で向きが失われる**。
 * WebP/JPEG へ再圧縮する経路では、ここで得た変換を画素に焼き込んでからエンコードすること。
 *
 * 未定義値・0（未設定）・1（正立）は恒等変換を返す。
 */
fun exifOrientationToTransform(exif: Int): ImageTransform = when (exif) {
    2 -> ImageTransform(0, true)      // 左右反転
    3 -> ImageTransform(180, false)   // 180度
    4 -> ImageTransform(180, true)    // 上下反転（=左右反転して180度）
    5 -> ImageTransform(90, true)     // 左右反転して時計回り90度
    6 -> ImageTransform(90, false)    // 時計回り90度（縦持ち撮影で最も多い）
    7 -> ImageTransform(270, true)    // 左右反転して反時計回り90度
    8 -> ImageTransform(270, false)   // 反時計回り90度
    else -> ImageTransform(0, false)  // 1=正立 / 0=未設定 / 想定外
}
